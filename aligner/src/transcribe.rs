//! Whisper speech recognition with word-level timestamps.

use anyhow::{Context, Result};
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext};

use crate::align::Heard;

pub struct Transcript {
    pub words: Vec<Heard>,
    pub language: String,
}

/// Runs Whisper over 16 kHz mono `samples`. `language` is "ru", "en", ... or "auto".
/// `prompt` (a piece of the lyrics) nudges the vocabulary towards the real words.
pub fn transcribe(ctx: &WhisperContext, samples: &[f32], language: &str, prompt: &str) -> Result<Transcript> {
    let mut state = ctx.create_state().context("cannot create Whisper state")?;
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 2 });
    let env = |k: &str| std::env::var(k).ok().and_then(|v| v.parse::<i32>().ok());
    let threads = env("ALIGNER_THREADS").unwrap_or_else(|| std::thread::available_parallelism().map(|n| n.get() as i32).unwrap_or(4).min(8));
    params.set_n_threads(threads);
    params.set_language(Some(language));
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    // One word per segment, each with its own start/end.
    params.set_token_timestamps(true);
    params.set_split_on_word(true);
    params.set_max_len(env("ALIGNER_MAXLEN").unwrap_or(1));
    params.set_suppress_blank(true);
    if !prompt.is_empty() && env("ALIGNER_PROMPT") != Some(0) {
        params.set_initial_prompt(prompt);
    }

    let t = std::time::Instant::now();
    state.full(params, samples).context("Whisper failed")?;
    let debug = std::env::var("ALIGNER_DEBUG").is_ok();
    if debug {
        eprintln!("whisper.full: {} ms, {} threads", t.elapsed().as_millis(), threads);
    }

    let eot = ctx.token_eot();
    // (text, segment start, segment end, DTW onset)
    let mut raw: Vec<(String, f32, f32, Option<f32>)> = Vec::new();
    for seg in state.as_iter() {
        let text = seg.to_str_lossy().map(|s| s.trim().to_string()).unwrap_or_default();
        // Skip empty pieces and Whisper's own tags like "[музыка]", "(music)", "♪".
        if text.is_empty() || text.starts_with(['[', '(', '♪', '*']) {
            continue;
        }
        // Timestamps are in centiseconds.
        let seg_start = seg.start_timestamp() as f32 / 100.0;
        let seg_end = seg.end_timestamp() as f32 / 100.0;
        let dtw = (0..seg.n_tokens())
            .filter_map(|i| seg.get_token(i))
            .find(|t| t.token_id() < eot)
            .map(|t| t.token_data().t_dtw)
            .filter(|&t| t >= 0)
            .map(|t| t as f32 / 100.0);
        if debug {
            eprintln!("  {seg_start:6.2} {seg_end:6.2} dtw={dtw:?} {text}");
        }
        raw.push((text, seg_start, seg_end, dtw));
    }
    let words = word_times(raw);
    let lang_id = state.full_lang_id_from_state();
    let language = whisper_rs::get_lang_str(lang_id).unwrap_or(language).to_string();
    Ok(Transcript { words, language })
}

/// DTW onsets come out consistently ~0.1 s late.
const DTW_LEAD: f32 = 0.1;
/// Longest a single sung word is assumed to last when nothing else bounds it.
const MAX_WORD: f32 = 1.5;

/// Turns raw segments into word times. Segment starts are useless after a pause (whisper glues a
/// word to the end of the previous one), so the start is the DTW onset; the end is the segment
/// end when it is plausible, otherwise it is bounded by the next word.
fn word_times(raw: Vec<(String, f32, f32, Option<f32>)>) -> Vec<Heard> {
    let starts: Vec<f32> = raw
        .iter()
        .map(|(_, s, _, dtw)| dtw.map(|t| (t - DTW_LEAD).max(0.0)).unwrap_or(*s))
        .collect();
    // DTW is monotonic in practice, but make sure of it.
    let mut starts = starts;
    for i in 1..starts.len() {
        if starts[i] < starts[i - 1] {
            starts[i] = starts[i - 1];
        }
    }
    raw.into_iter()
        .enumerate()
        .map(|(i, (text, _, seg_end, _))| {
            let start = starts[i];
            let next = starts.get(i + 1).copied().unwrap_or(f32::MAX);
            let end = if seg_end > start && seg_end <= next {
                seg_end.min(start + MAX_WORD)
            } else {
                next.min(start + MAX_WORD)
            };
            Heard { text, start, end: end.max(start + 0.05) }
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dtw_onset_wins_over_glued_segment_start() {
        // "мы" really starts at 18.1, but whisper's segment says 14.0 (end of the previous word).
        let raw = vec![
            ("луной".to_string(), 13.68, 14.0, Some(13.8)),
            ("мы".to_string(), 14.0, 14.5, Some(18.24)),
            ("допоём".to_string(), 14.5, 16.0, Some(18.5)),
        ];
        let w = word_times(raw);
        assert!((w[1].start - 18.14).abs() < 0.01);
        assert!(w[1].end > w[1].start && w[1].end <= w[2].start);
        assert!(w[0].end <= 14.0 + 0.01);
    }
}
