//! KaraokeCraft aligner: a small local HTTP service that puts timings on lyric lines.
//!
//!   POST /align  (multipart: audio=<file>, lyrics=<JSON array of lines>, language=ru|en|auto)
//!   GET  /health
//!
//! Settings (environment variables):
//!   WHISPER_MODEL    path to a ggml model        (default: models/ggml-small.bin)
//!   ALIGNER_PORT     port on 127.0.0.1            (default: 8787)
//!   ALIGNER_ORIGINS  allowed site origins, comma-separated
//!   ALIGNER_PUBLIC   0 = only this computer; otherwise a Cloudflare tunnel makes the service
//!                    reachable from other devices and its address is published to Firestore

mod align;
mod audio;
mod transcribe;
mod tunnel;

use std::net::SocketAddr;
use std::sync::Arc;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::time::{Duration, Instant};

use axum::extract::{DefaultBodyLimit, Multipart, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
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
const MAX_LYRICS_CHARS: usize = 24_000;
const MAX_WAITING_JOBS: usize = 2;
/// Site addresses allowed to call the service (plus any localhost port, see `origin_allowed`).
const DEFAULT_ORIGINS: &str = "https://karaokecraft.vercel.app";

struct AppState {
    ctx: WhisperContext,
    model: String,
    /// Whisper uses all CPU cores, so jobs run one at a time.
    busy: Semaphore,
    /// Bounds queued requests before reading large multipart uploads into memory.
    waiting: AtomicUsize,
    http: reqwest::Client,
}

struct QueueGuard<'a>(&'a AtomicUsize);
impl Drop for QueueGuard<'_> {
    fn drop(&mut self) {
        self.0.fetch_sub(1, Ordering::SeqCst);
    }
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
    if let Some(preset) = dtw_preset(&model) {
        cparams.dtw_parameters(DtwParameters { mode: DtwMode::ModelPreset { model_preset: preset }, ..Default::default() });
    } else {
        tracing::warn!("unknown model name, word starts will be less precise");
    }
    let ctx = WhisperContext::new_with_params(&model, cparams)
        .map_err(|e| anyhow::anyhow!("cannot load model: {e:?}"))?;
    let http = reqwest::Client::new();
    let state = Arc::new(AppState {
        ctx,
        model,
        busy: Semaphore::new(1),
        waiting: AtomicUsize::new(0),
        http: http.clone(),
    });

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
        .allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
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

    let mut tunnel_child = None;
    let mut publisher = None;
    if std::env::var("ALIGNER_PUBLIC").map(|v| v != "0").unwrap_or(true) {
        match tunnel::Publisher::from_env(http) {
            None => tracing::warn!(
                "ALIGNER_EMAIL / ALIGNER_PASSWORD are not set: no public access, this computer only \
                 (see aligner/README.md, section on phones and other computers)"
            ),
            Some(p) => match p.sign_in().await {
                Err(e) => tracing::warn!("no public access, this computer only: {e:#}"),
                Ok(()) => match tunnel::start(port).await {
                    Ok((child, url)) => {
                        tracing::info!("public address: {url} (other devices find it automatically)");
                        tunnel_child = Some(child);
                        let p = std::sync::Arc::new(p);
                        tokio::spawn(tunnel::heartbeat(p.clone(), url));
                        publisher = Some(p);
                    }
                    Err(e) => tracing::warn!("no public access, this computer only: {e:#}"),
                },
            },
        }
    }

    axum::serve(listener, app)
        .with_graceful_shutdown(async {
            let _ = tokio::signal::ctrl_c().await;
        })
        .await?;

    if let Some(p) = &publisher {
        let _ = tokio::time::timeout(Duration::from_secs(3), p.publish("")).await;
    }
    drop(tunnel_child);
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

fn is_tunneled_request(headers: &HeaderMap) -> bool {
    headers.contains_key("cf-connecting-ip") || headers.contains_key("cf-ray") || headers.contains_key("x-forwarded-for")
}

async fn align_handler(
    State(st): State<Arc<AppState>>,
    headers: HeaderMap,
    mut form: Multipart,
) -> Result<Json<AlignResponse>, ApiError> {
    // Requests arriving over the public Cloudflare tunnel must carry a valid Firebase ID token.
    if is_tunneled_request(&headers) {
        let bearer = headers
            .get(header::AUTHORIZATION)
            .and_then(|v| v.to_str().ok())
            .and_then(|v| v.strip_prefix("Bearer "))
            .unwrap_or("");
        if !tunnel::verify_user_token(&st.http, bearer).await {
            return Err(ApiError(
                StatusCode::UNAUTHORIZED,
                "Требуется вход в аккаунт для авто-тайминга".into(),
            ));
        }
    }

    // Cap concurrent waiters and acquire the worker slot BEFORE buffering up to 60 MB into RAM.
    if st.waiting.fetch_add(1, Ordering::SeqCst) > MAX_WAITING_JOBS {
        st.waiting.fetch_sub(1, Ordering::SeqCst);
        return Err(ApiError(
            StatusCode::TOO_MANY_REQUESTS,
            "Сервис занят другой песней, попробуйте через минуту".into(),
        ));
    }
    let _queue_guard = QueueGuard(&st.waiting);

    let _permit = tokio::time::timeout(Duration::from_secs(90), st.busy.acquire())
        .await
        .map_err(|_| ApiError(StatusCode::TOO_MANY_REQUESTS, "Сервис занят, попробуйте позже".into()))?
        .map_err(|_| ApiError(StatusCode::SERVICE_UNAVAILABLE, "shutting down".into()))?;

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
                if text.len() > MAX_LYRICS_CHARS {
                    return Err(bad("текст песни слишком длинный"));
                }
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

    let started = Instant::now();
    let st2 = st.clone();
    let result = tokio::task::spawn_blocking(move || -> anyhow::Result<AlignResponse> {
        let samples = audio::decode_to_16k_mono(bytes, ext.as_deref(), MAX_SECONDS)?;
        let duration = samples.len() as f32 / audio::TARGET_RATE as f32;
        if duration > MAX_SECONDS {
            anyhow::bail!("audio is longer than {} minutes", MAX_SECONDS / 60.0);
        }
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
