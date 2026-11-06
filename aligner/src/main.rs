//! KaraokeCraft aligner: a small local HTTP service that puts timings on lyric lines.
//!
//!   POST /align  (multipart: audio=<file>, lyrics=<JSON array of lines>, language=ru|en|auto)
//!   GET  /health
//!
//! Settings (environment variables):
//!   WHISPER_MODEL    path to a ggml model        (default: models/ggml-small.bin)
//!   ALIGNER_PORT     port on 127.0.0.1            (default: 8787)
//!   ALIGNER_ORIGINS  allowed site origins, comma-separated

mod align;
mod audio;
mod transcribe;

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Instant;

use axum::extract::{DefaultBodyLimit, Multipart, State};
use axum::http::{HeaderValue, Method, StatusCode, header};
use axum::response::{IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Serialize;
use serde_json::json;
use tokio::sync::Semaphore;
use tower_http::cors::{AllowOrigin, CorsLayer};
use whisper_rs::{DtwMode, DtwModelPreset, DtwParameters, WhisperContext, WhisperContextParameters};

const MAX_UPLOAD: usize = 60 * 1024 * 1024;
const MAX_SECONDS: f32 = 15.0 * 60.0;
const MAX_LINES: usize = 1000;
/// Site addresses allowed to call the service (plus any localhost port, see `origin_allowed`).
const DEFAULT_ORIGINS: &str = "https://karaokecraft.vercel.app,https://karaoke-six-dusky.vercel.app";

struct AppState {
    ctx: WhisperContext,
    model: String,
    /// Whisper uses all CPU cores, so jobs run one at a time.
    busy: Semaphore,
}

#[derive(Serialize)]
struct AlignResponse {
    language: String,
    duration: f32,
    elapsed_ms: u128,
    /// How many lyric words were recognised overall (0..1).
    confidence: f32,
    lines: Vec<align::LineTiming>,
}

struct ApiError(StatusCode, String);

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "error": self.1 }))).into_response()
    }
}

fn bad(msg: impl Into<String>) -> ApiError {
    ApiError(StatusCode::BAD_REQUEST, msg.into())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::fmt().with_target(false).init();

    let model = std::env::var("WHISPER_MODEL").unwrap_or_else(|_| "models/ggml-small.bin".into());
    if !std::path::Path::new(&model).exists() {
        anyhow::bail!("model not found: {model} (see aligner/README.md)");
    }
    tracing::info!("loading model {model}");
    let mut cparams = WhisperContextParameters::default();
    // DTW over the model's alignment heads gives each token a real onset time; without it a word
    // "starts" where the previous one ended, so lines after a pause begin too early.
    if let Some(preset) = dtw_preset(&model) {
        cparams.dtw_parameters(DtwParameters { mode: DtwMode::ModelPreset { model_preset: preset }, ..Default::default() });
    } else {
        tracing::warn!("unknown model name, word starts will be less precise");
    }
    let ctx = WhisperContext::new_with_params(&model, cparams)
        .map_err(|e| anyhow::anyhow!("cannot load model: {e:?}"))?;
    let state = Arc::new(AppState { ctx, model, busy: Semaphore::new(1) });

    // ALIGNER_ORIGINS adds to the defaults, so a new domain doesn't silently drop the old ones.
    let mut origins: Vec<String> = DEFAULT_ORIGINS.split(',').map(String::from).collect();
    if let Ok(extra) = std::env::var("ALIGNER_ORIGINS") {
        origins.extend(extra.split(',').map(|o| o.trim().trim_end_matches('/').to_string()).filter(|o| !o.is_empty()));
    }
    tracing::info!("allowed sites: {} and localhost", origins.join(", "));
    let cors = CorsLayer::new()
        .allow_origin(AllowOrigin::predicate(move |origin: &HeaderValue, _| {
            origin.to_str().map(|o| origin_allowed(o, &origins)).unwrap_or(false)
        }))
        .allow_methods([Method::GET, Method::POST])
        .allow_headers([header::CONTENT_TYPE])
        // Lets an https site call this service on localhost (Chrome "private network access").
        .allow_private_network(true);

    let app = Router::new()
        .route("/health", get(health))
        .route("/align", post(align_handler))
        .layer(DefaultBodyLimit::max(MAX_UPLOAD))
        .layer(cors)
        .with_state(state);

    let port: u16 = std::env::var("ALIGNER_PORT").ok().and_then(|p| p.parse().ok()).unwrap_or(8787);
    let addr = SocketAddr::from(([127, 0, 0, 1], port));
    tracing::info!("aligner ready on http://{addr}");
    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;
    Ok(())
}

/// Exact match with an allowed site, or the site running locally on any port.
fn origin_allowed(origin: &str, allowed: &[String]) -> bool {
    if allowed.iter().any(|a| a == origin) {
        return true;
    }
    let host = origin.strip_prefix("http://").or_else(|| origin.strip_prefix("https://")).unwrap_or("");
    let host = host.rsplit_once(':').map(|(h, port)| if port.chars().all(|c| c.is_ascii_digit()) { h } else { host }).unwrap_or(host);
    matches!(host, "localhost" | "127.0.0.1" | "[::1]")
}

/// DTW alignment heads must match the model, so pick the preset from the file name.
fn dtw_preset(model_path: &str) -> Option<DtwModelPreset> {
    let name = std::path::Path::new(model_path).file_stem()?.to_str()?.to_lowercase();
    let name = name.trim_start_matches("ggml-");
    Some(match name {
        "tiny" => DtwModelPreset::Tiny,
        "tiny.en" => DtwModelPreset::TinyEn,
        "base" => DtwModelPreset::Base,
        "base.en" => DtwModelPreset::BaseEn,
        "small" => DtwModelPreset::Small,
        "small.en" => DtwModelPreset::SmallEn,
        "medium" => DtwModelPreset::Medium,
        "medium.en" => DtwModelPreset::MediumEn,
        "large-v3" => DtwModelPreset::LargeV3,
        "large-v3-turbo" => DtwModelPreset::LargeV3Turbo,
        _ => return None,
    })
}

async fn health(State(st): State<Arc<AppState>>) -> Json<serde_json::Value> {
    Json(json!({
        "ok": true,
        "model": std::path::Path::new(&st.model).file_name().and_then(|n| n.to_str()),
        "busy": st.busy.available_permits() == 0,
    }))
}

async fn align_handler(State(st): State<Arc<AppState>>, mut form: Multipart) -> Result<Json<AlignResponse>, ApiError> {
    let mut audio: Option<(Vec<u8>, Option<String>)> = None;
    let mut lines: Option<Vec<String>> = None;
    let mut language = "auto".to_string();

    while let Some(field) = form.next_field().await.map_err(|e| bad(format!("bad form: {e}")))? {
        match field.name().unwrap_or("") {
            "audio" => {
                let ext = field
                    .file_name()
                    .and_then(|n| n.rsplit_once('.').map(|(_, e)| e.to_lowercase()));
                let bytes = field.bytes().await.map_err(|e| bad(format!("upload failed: {e}")))?;
                audio = Some((bytes.to_vec(), ext));
            }
            "lyrics" => {
                let text = field.text().await.map_err(|e| bad(e.to_string()))?;
                let parsed: Vec<String> =
                    serde_json::from_str(&text).map_err(|_| bad("lyrics must be a JSON array of strings"))?;
                lines = Some(parsed);
            }
            "language" => {
                let l = field.text().await.unwrap_or_default().trim().to_lowercase();
                if l.len() <= 5 && l.chars().all(|c| c.is_ascii_lowercase()) && !l.is_empty() {
                    language = l;
                }
            }
            _ => {}
        }
    }
    let (bytes, ext) = audio.ok_or_else(|| bad("no audio file"))?;
    let lines = lines.ok_or_else(|| bad("no lyrics"))?;
    if lines.is_empty() || lines.len() > MAX_LINES {
        return Err(bad(format!("lyrics must have 1..{MAX_LINES} lines")));
    }

    let _permit = st
        .busy
        .acquire()
        .await
        .map_err(|_| ApiError(StatusCode::SERVICE_UNAVAILABLE, "shutting down".into()))?;
    let started = Instant::now();
    let st2 = st.clone();
    let result = tokio::task::spawn_blocking(move || -> anyhow::Result<AlignResponse> {
        let samples = audio::decode_to_16k_mono(bytes, ext.as_deref())?;
        let duration = samples.len() as f32 / audio::TARGET_RATE as f32;
        if duration > MAX_SECONDS {
            anyhow::bail!("audio is longer than {} minutes", MAX_SECONDS / 60.0);
        }
        // The start of the lyrics as a hint; Whisper only uses ~200 tokens of it anyway.
        let prompt: String = lines.join(" ").chars().take(300).collect();
        let t = transcribe::transcribe(&st2.ctx, &samples, &language, &prompt)?;
        let timed = align::align(&lines, &t.words, duration);
        let (m, total) = timed
            .iter()
            .flat_map(|l| &l.words)
            .fold((0, 0), |(m, n), w| (m + usize::from(w.matched), n + 1));
        Ok(AlignResponse {
            language: t.language,
            duration,
            elapsed_ms: 0,
            confidence: if total == 0 { 0.0 } else { m as f32 / total as f32 },
            lines: timed,
        })
    })
    .await
    .map_err(|e| ApiError(StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;

    match result {
        Ok(mut r) => {
            r.elapsed_ms = started.elapsed().as_millis();
            tracing::info!(
                "aligned {} lines, {:.0}s audio, lang {}, confidence {:.0}%, {} ms",
                r.lines.len(),
                r.duration,
                r.language,
                r.confidence * 100.0,
                r.elapsed_ms
            );
            Ok(Json(r))
        }
        Err(e) => Err(ApiError(StatusCode::UNPROCESSABLE_ENTITY, format!("{e:#}"))),
    }
}

#[cfg(test)]
mod tests {
    use super::origin_allowed;

    #[test]
    fn origins() {
        let allowed = vec!["https://karaokecraft.vercel.app".to_string()];
        assert!(origin_allowed("https://karaokecraft.vercel.app", &allowed));
        assert!(origin_allowed("http://localhost:3005", &allowed));
        assert!(origin_allowed("http://127.0.0.1:3000", &allowed));
        assert!(!origin_allowed("https://evil.example", &allowed));
        assert!(!origin_allowed("https://localhost.evil.example", &allowed));
        assert!(!origin_allowed("https://karaokecraft.vercel.app.evil.example", &allowed));
    }
}
