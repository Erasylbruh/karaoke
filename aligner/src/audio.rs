//! Audio decoding: any supported file (mp3, m4a/aac, ogg, wav, flac) -> 16 kHz mono f32,
//! which is what Whisper expects.

use std::io::Cursor;

use anyhow::{Context, Result, anyhow};
use symphonia::core::codecs::audio::AudioDecoderOptions;
use symphonia::core::errors::Error;
use symphonia::core::formats::probe::Hint;
use symphonia::core::formats::{FormatOptions, TrackType};
use symphonia::core::io::MediaSourceStream;
use symphonia::core::meta::MetadataOptions;

pub const TARGET_RATE: u32 = 16_000;

/// Decodes `bytes` and returns 16 kHz mono samples.
pub fn decode_to_16k_mono(bytes: Vec<u8>, ext_hint: Option<&str>) -> Result<Vec<f32>> {
    let mss = MediaSourceStream::new(Box::new(Cursor::new(bytes)), Default::default());
    let mut hint = Hint::new();
    if let Some(ext) = ext_hint {
        hint.with_extension(ext);
    }
    let mut format = symphonia::default::get_probe()
        .probe(&hint, mss, FormatOptions::default(), MetadataOptions::default())
        .context("unsupported or damaged audio file")?;

    let track = format
        .default_track(TrackType::Audio)
        .ok_or_else(|| anyhow!("the file has no audio track"))?;
    let track_id = track.id;
    let params = track
        .codec_params
        .as_ref()
        .and_then(|p| p.audio())
        .ok_or_else(|| anyhow!("unsupported audio codec"))?;
    let mut decoder = symphonia::default::get_codecs()
        .make_audio_decoder(params, &AudioDecoderOptions::default())
        .context("unsupported audio codec")?;

    let mut mono: Vec<f32> = Vec::new();
    let mut rate = 0u32;
    let mut buf: Vec<f32> = Vec::new();
    loop {
        let packet = match format.next_packet() {
            Ok(Some(p)) => p,
            Ok(None) => break,
            Err(Error::IoError(_)) => break, // truncated file: keep what was decoded
            Err(e) => return Err(e.into()),
        };
        if packet.track_id != track_id {
            continue;
        }
        match decoder.decode(&packet) {
            Ok(audio) => {
                let spec = audio.spec();
                rate = spec.rate();
                let ch = spec.channels().count().max(1);
                buf.resize(audio.samples_interleaved(), 0.0);
                audio.copy_to_slice_interleaved(&mut buf);
                mono.extend(buf.chunks_exact(ch).map(|f| f.iter().sum::<f32>() / ch as f32));
            }
            Err(Error::DecodeError(_)) => continue, // skip a damaged frame
            Err(e) => return Err(e.into()),
        }
    }
    if mono.is_empty() || rate == 0 {
        return Err(anyhow!("no audio could be decoded"));
    }
    Ok(resample(&mono, rate, TARGET_RATE))
}

/// Windowed-sinc low-pass (to avoid aliasing) followed by linear interpolation.
/// Simple, but more than good enough for speech recognition.
pub fn resample(input: &[f32], from: u32, to: u32) -> Vec<f32> {
    if from == to {
        return input.to_vec();
    }
    let filtered;
    let src: &[f32] = if from > to {
        filtered = lowpass(input, (to as f32 * 0.45) / from as f32);
        &filtered
    } else {
        input
    };
    let ratio = from as f64 / to as f64;
    let out_len = (src.len() as f64 / ratio).floor() as usize;
    (0..out_len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let i0 = pos.floor() as usize;
            let frac = (pos - i0 as f64) as f32;
            let a = src[i0.min(src.len() - 1)];
            let b = src[(i0 + 1).min(src.len() - 1)];
            a + (b - a) * frac
        })
        .collect()
}

/// FIR low-pass; `cutoff` is a fraction of the sample rate (0..0.5).
fn lowpass(input: &[f32], cutoff: f32) -> Vec<f32> {
    const TAPS: usize = 63;
    let m = (TAPS - 1) as f32;
    let mut kernel: Vec<f32> = (0..TAPS)
        .map(|n| {
            let x = n as f32 - m / 2.0;
            let sinc = if x == 0.0 {
                2.0 * cutoff
            } else {
                (2.0 * std::f32::consts::PI * cutoff * x).sin() / (std::f32::consts::PI * x)
            };
            let window = 0.42 - 0.5 * (2.0 * std::f32::consts::PI * n as f32 / m).cos()
                + 0.08 * (4.0 * std::f32::consts::PI * n as f32 / m).cos();
            sinc * window
        })
        .collect();
    let sum: f32 = kernel.iter().sum();
    kernel.iter_mut().for_each(|k| *k /= sum);

    let half = TAPS / 2;
    (0..input.len())
        .map(|i| {
            let mut acc = 0.0;
            for (k, w) in kernel.iter().enumerate() {
                let j = i as isize + k as isize - half as isize;
                if j >= 0 && (j as usize) < input.len() {
                    acc += input[j as usize] * w;
                }
            }
            acc
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resample_keeps_duration() {
        let one_second = vec![0.0f32; 44_100];
        let out = resample(&one_second, 44_100, 16_000);
        assert!((out.len() as i64 - 16_000).abs() <= 1);
    }

    #[test]
    fn lowpass_keeps_dc() {
        let out = lowpass(&vec![1.0f32; 500], 0.2);
        assert!((out[250] - 1.0).abs() < 1e-3);
    }
}
