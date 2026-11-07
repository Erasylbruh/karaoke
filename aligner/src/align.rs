//! Matches the words Whisper heard against the author's lyrics.
//!
//! Whisper often mishears sung words, so we don't trust its text: we align its word sequence to
//! the real lyrics (Needleman–Wunsch with fuzzy word similarity) and take only the timings.
//! Lyric words with no match get times interpolated from their neighbours.

use serde::Serialize;

/// A word recognised by Whisper, times in seconds.
#[derive(Debug, Clone)]
pub struct Heard {
    pub text: String,
    pub start: f32,
    pub end: f32,
}

#[derive(Debug, Clone, Serialize)]
pub struct WordTiming {
    pub text: String,
    pub start: f32,
    pub end: f32,
    /// true when the time comes from a recognised word, false when it was interpolated.
    pub matched: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct LineTiming {
    pub index: usize,
    pub start: f32,
    pub end: f32,
    /// Share of the line's words that were actually recognised (0..1). Low = check by hand.
    pub confidence: f32,
    pub words: Vec<WordTiming>,
}

/// Lowercase letters and digits only; ё -> е and katakana -> hiragana, so both spellings match.
pub fn normalize(word: &str) -> String {
    word.chars()
        .filter(|c| c.is_alphanumeric())
        .flat_map(|c| c.to_lowercase())
        .map(|c| match c {
            'ё' => 'е',
            '\u{30A1}'..='\u{30F6}' => char::from_u32(c as u32 - 0x60).unwrap_or(c),
            _ => c,
        })
        .collect()
}

/// Japanese, Chinese and Korean characters. These scripts put no spaces between words,
/// so they are matched character by character.
fn is_cjk(c: char) -> bool {
    matches!(c,
        '\u{3040}'..='\u{30FF}'     // hiragana, katakana
        | '\u{3400}'..='\u{4DBF}'   // CJK extension A
        | '\u{4E00}'..='\u{9FFF}'   // CJK ideographs
        | '\u{AC00}'..='\u{D7AF}'   // hangul syllables
        | '\u{FF66}'..='\u{FF9F}'   // half-width katakana
    )
}

/// Splits text into matching units: each CJK character on its own, other runs as words.
pub fn units(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    for word in text.split_whitespace() {
        let mut run = String::new();
        for c in word.chars() {
            if is_cjk(c) {
                if !run.is_empty() {
                    out.push(std::mem::take(&mut run));
                }
                out.push(c.to_string());
            } else {
                run.push(c);
            }
        }
        if !run.is_empty() {
            out.push(run);
        }
    }
    out
}

/// 1 - normalised Levenshtein distance (0 = different, 1 = equal).
pub fn similarity(a: &str, b: &str) -> f32 {
    let a: Vec<char> = a.chars().collect();
    let b: Vec<char> = b.chars().collect();
    if a.is_empty() || b.is_empty() {
        return 0.0;
    }
    let mut prev: Vec<usize> = (0..=b.len()).collect();
    let mut cur = vec![0; b.len() + 1];
    for i in 1..=a.len() {
        cur[0] = i;
        for j in 1..=b.len() {
            let cost = usize::from(a[i - 1] != b[j - 1]);
            cur[j] = (prev[j] + 1).min(cur[j - 1] + 1).min(prev[j - 1] + cost);
        }
        std::mem::swap(&mut prev, &mut cur);
    }
    1.0 - prev[b.len()] as f32 / a.len().max(b.len()) as f32
}

const GAP: f32 = -0.4;
const MIN_SIM: f32 = 0.5;

/// Aligns lyric words to heard words; returns for each lyric word the index of its heard word.
fn align_words(lyric: &[String], heard: &[String]) -> Vec<Option<usize>> {
    let (n, m) = (lyric.len(), heard.len());
    let mut score = vec![vec![0f32; m + 1]; n + 1];
    // 0 = diagonal, 1 = skip lyric word, 2 = skip heard word
    let mut step = vec![vec![0u8; m + 1]; n + 1];
    for i in 1..=n {
        score[i][0] = i as f32 * GAP;
        step[i][0] = 1;
    }
    for j in 1..=m {
        // Heard words before the first lyric word (intro chatter, hallucinations) are free to skip.
        score[0][j] = 0.0;
        step[0][j] = 2;
    }
    for i in 1..=n {
        for j in 1..=m {
            let sim = similarity(&lyric[i - 1], &heard[j - 1]);
            let diag = score[i - 1][j - 1] + 2.0 * sim - 1.0;
            let up = score[i - 1][j] + GAP;
            let left = score[i][j - 1] + if i == n { 0.0 } else { GAP };
            let (best, s) = if diag >= up && diag >= left {
                (diag, 0)
            } else if up >= left {
                (up, 1)
            } else {
                (left, 2)
            };
            score[i][j] = best;
            step[i][j] = s;
        }
    }
    let mut out = vec![None; n];
    let (mut i, mut j) = (n, m);
    while i > 0 && j > 0 {
        match step[i][j] {
            0 => {
                if similarity(&lyric[i - 1], &heard[j - 1]) >= MIN_SIM {
                    out[i - 1] = Some(j - 1);
                }
                i -= 1;
                j -= 1;
            }
            1 => i -= 1,
            _ => j -= 1,
        }
    }
    out
}

/// Main entry: lyric lines + heard words -> timings for every line and word.
pub fn align(lines: &[String], heard: &[Heard], duration: f32) -> Vec<LineTiming> {
    // Flatten the lyrics into words, remembering their line.
    let mut words: Vec<(usize, String, String)> = Vec::new(); // (line, original, normalised)
    for (li, line) in lines.iter().enumerate() {
        for w in units(line) {
            let norm = normalize(&w);
            if !norm.is_empty() {
                words.push((li, w, norm));
            }
        }
    }
    // Heard pieces are split the same way; a piece's time is shared among its units by length.
    let heard: Vec<Heard> = heard
        .iter()
        .flat_map(|h| {
            let parts: Vec<String> = units(&h.text).into_iter().filter(|u| !normalize(u).is_empty()).collect();
            let total = parts.iter().map(|p| p.chars().count()).sum::<usize>().max(1);
            let mut t = h.start;
            parts
                .into_iter()
                .map(|p| {
                    let d = (h.end - h.start).max(0.0) * p.chars().count() as f32 / total as f32;
                    let piece = Heard { text: p, start: t, end: t + d };
                    t += d;
                    piece
                })
                .collect::<Vec<_>>()
        })
        .collect();
    let heard_norm: Vec<String> = heard.iter().map(|h| normalize(&h.text)).collect();
    let lyric_norm: Vec<String> = words.iter().map(|w| w.2.clone()).collect();
    let matches = align_words(&lyric_norm, &heard_norm);

    // Times for matched words, then interpolate the rest.
    let mut times: Vec<Option<(f32, f32)>> =
        matches.iter().map(|m| m.map(|j| (heard[j].start, heard[j].end.max(heard[j].start + 0.05)))).collect();
    fill_gaps(&mut times, &words.iter().map(|w| w.2.chars().count()).collect::<Vec<_>>(), duration);

    let mut out: Vec<LineTiming> = Vec::with_capacity(lines.len());
    for li in 0..lines.len() {
        let idx: Vec<usize> = (0..words.len()).filter(|&k| words[k].0 == li).collect();
        let word_timings: Vec<WordTiming> = idx
            .iter()
            .map(|&k| {
                let (s, e) = times[k].unwrap_or((0.0, 0.0));
                WordTiming { text: words[k].1.clone(), start: s, end: e, matched: matches[k].is_some() }
            })
            .collect();
        let matched = word_timings.iter().filter(|w| w.matched).count();
        let (start, end) = match (word_timings.first(), word_timings.last()) {
            (Some(f), Some(l)) => (f.start, l.end),
            // A line without words (e.g. "♪"): placed right after the previous line.
            _ => {
                let t = out.last().map(|p| p.end).unwrap_or(0.0);
                (t, t)
            }
        };
        out.push(LineTiming {
            index: li,
            start,
            end,
            confidence: if word_timings.is_empty() { 0.0 } else { matched as f32 / word_timings.len() as f32 },
            words: word_timings,
        });
    }
    // Lines must never go backwards in time.
    for k in 1..out.len() {
        if out[k].start < out[k - 1].start {
            out[k].start = out[k - 1].start;
        }
        if out[k].end < out[k].start {
            out[k].end = out[k].start;
        }
    }
    for l in &mut out {
        l.start = round2(l.start);
        l.end = round2(l.end);
        for w in &mut l.words {
            w.start = round2(w.start);
            w.end = round2(w.end);
        }
    }
    out
}

fn round2(x: f32) -> f32 {
    (x * 100.0).round() / 100.0
}

/// Gives unmatched words times between their matched neighbours, in proportion to word length.
fn fill_gaps(times: &mut [Option<(f32, f32)>], lens: &[usize], duration: f32) {
    const WORD: f32 = 0.35; // typical sung word length when there is nothing to go on
    let n = times.len();
    let mut k = 0;
    while k < n {
        if times[k].is_some() {
            k += 1;
            continue;
        }
        let a = k;
        while k < n && times[k].is_none() {
            k += 1;
        }
        let b = k; // gap is a..b
        let count = (b - a) as f32;
        let (from, to) = match (a.checked_sub(1).and_then(|p| times[p]), times.get(b).copied().flatten()) {
            (Some(p), Some(q)) => (p.1, q.0.max(p.1)),
            (Some(p), None) => (p.1, (p.1 + count * WORD).min(duration.max(p.1))),
            (None, Some(q)) => ((q.0 - count * WORD).max(0.0), q.0),
            (None, None) => (0.0, duration.max(count * WORD)),
        };
        let total: usize = lens[a..b].iter().map(|&l| l.max(1)).sum();
        let mut t = from;
        for i in a..b {
            let d = (to - from) * lens[i].max(1) as f32 / total as f32;
            times[i] = Some((t, t + d));
            t += d;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn h(text: &str, start: f32, end: f32) -> Heard {
        Heard { text: text.into(), start, end }
    }

    #[test]
    fn normalizes_case_punctuation_and_yo() {
        assert_eq!(normalize("Ёлка,"), "елка");
        assert_eq!(normalize("Hello!"), "hello");
    }

    #[test]
    fn exact_words_get_their_times() {
        let lines = vec!["я иду домой".to_string(), "и пою".to_string()];
        let heard = vec![h("Я", 1.0, 1.2), h("иду", 1.2, 1.6), h("домой", 1.6, 2.2), h("и", 3.0, 3.1), h("пою", 3.1, 3.8)];
        let out = align(&lines, &heard, 10.0);
        assert_eq!(out[0].start, 1.0);
        assert_eq!(out[0].end, 2.2);
        assert_eq!(out[1].start, 3.0);
        assert_eq!(out[1].confidence, 1.0);
    }

    #[test]
    fn misheard_and_extra_words_are_tolerated() {
        let lines = vec!["ночной город спит".to_string(), "фонари горят".to_string()];
        // "город" misheard as "горот", junk word "субтитры" at the start, "горят" missing.
        let heard = vec![
            h("субтитры", 0.0, 0.5),
            h("ночной", 2.0, 2.4),
            h("горот", 2.4, 2.9),
            h("спит", 2.9, 3.3),
            h("фонари", 5.0, 5.6),
        ];
        let out = align(&lines, &heard, 10.0);
        assert_eq!(out[0].start, 2.0);
        assert!(out[0].words[1].matched);
        assert_eq!(out[1].start, 5.0);
        assert!(!out[1].words[1].matched);
        assert!(out[1].end > 5.6);
        assert_eq!(out[1].confidence, 0.5);
    }

    #[test]
    fn japanese_is_matched_by_character() {
        assert_eq!(units("君の名は"), vec!["君", "の", "名", "は"]);
        assert_eq!(units("I love 東京"), vec!["I", "love", "東", "京"]);
        // katakana and hiragana spellings match
        assert_eq!(normalize("カタ"), normalize("かた"));
        let lines = vec!["君の名は".to_string(), "夢を見た".to_string()];
        // Whisper returns multi-character pieces; "見" was heard as "み".
        let heard = vec![h("君の", 1.0, 1.6), h("名は", 1.6, 2.2), h("夢を", 4.0, 4.6), h("みた", 4.6, 5.2)];
        let out = align(&lines, &heard, 10.0);
        assert!((out[0].start - 1.0).abs() < 0.01);
        assert!((out[1].start - 4.0).abs() < 0.01);
        assert!(out[1].confidence >= 0.5);
    }

    #[test]
    fn lines_never_go_backwards() {
        let lines = vec!["раз".to_string(), "два".to_string()];
        let out = align(&lines, &[], 4.0);
        assert!(out[1].start >= out[0].start);
    }
}
