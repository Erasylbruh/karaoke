//! Makes this computer reachable from the site on any device.
//!
//! Starts a Cloudflare quick tunnel (`cloudflared tunnel --url …`, free, no account) that gives
//! the local service a public https address, then publishes that address to Firestore
//! (`config/aligner`) and refreshes it every minute. The site reads the document and sends
//! auto-timing requests there, so a phone or another computer can use this PC as the server.
//! The write is made as the service's own Firebase account (`ALIGNER_EMAIL` / `ALIGNER_PASSWORD`).

use std::process::Stdio;
use std::sync::Arc;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow};
use serde_json::{Value, json};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;

const FIREBASE_PROJECT: &str = "karaoke-craft";
/// Public Firebase web key (the same one the site ships with).
const FIREBASE_KEY: &str = "AIzaSyBIPxWfy5kQVl-VRNgBdceiT_Xh0MYzP58";
const HEARTBEAT: Duration = Duration::from_secs(60);

fn cloudflared_path() -> String {
    if let Ok(p) = std::env::var("CLOUDFLARED") {
        return p;
    }
    let default = r"C:\Program Files (x86)\cloudflared\cloudflared.exe";
    if std::path::Path::new(default).exists() { default.into() } else { "cloudflared".into() }
}

/// Starts the tunnel and waits for its public URL. The returned child must be kept alive.
pub async fn start(port: u16) -> Result<(Child, String)> {
    let mut child = Command::new(cloudflared_path())
        .args(["tunnel", "--no-autoupdate", "--url", &format!("http://127.0.0.1:{port}")])
        .stdout(Stdio::null())
        .stderr(Stdio::piped())
        .kill_on_drop(true)
        .spawn()
        .context("cloudflared not found: install it with `winget install Cloudflare.cloudflared`")?;
    let stderr = child.stderr.take().ok_or_else(|| anyhow!("no cloudflared output"))?;
    let mut lines = BufReader::new(stderr).lines();

    let url = tokio::time::timeout(Duration::from_secs(60), async {
        while let Some(line) = lines.next_line().await? {
            if let Some(url) = find_tunnel_url(&line) {
                return Ok::<_, anyhow::Error>(url);
            }
        }
        Err(anyhow!("cloudflared exited before giving an address"))
    })
    .await
    .map_err(|_| anyhow!("cloudflared gave no address within 60 s"))??;

    // Keep draining the output so cloudflared never blocks on a full pipe.
    tokio::spawn(async move { while let Ok(Some(_)) = lines.next_line().await {} });
    Ok((child, url))
}

/// Picks `https://<name>.trycloudflare.com` out of a cloudflared log line.
pub fn find_tunnel_url(line: &str) -> Option<String> {
    let start = line.find("https://")?;
    let url: String = line[start..].chars().take_while(|c| !c.is_whitespace() && *c != '|').collect();
    url.ends_with(".trycloudflare.com").then_some(url)
}

fn now_ms() -> i64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as i64).unwrap_or(0)
}

/// Sign in again when the Firebase ID token (valid for an hour) has less than this left.
const TOKEN_MARGIN: Duration = Duration::from_secs(5 * 60);

struct Token {
    id: String,
    expires: Instant,
}

/// Writes `config/aligner` as the service's own Firebase account. Firestore rules let only the
/// account whose uid is in `services/aligner` write there (see README).
pub struct Publisher {
    client: reqwest::Client,
    email: String,
    password: String,
    token: Mutex<Option<Token>>,
}

impl Publisher {
    /// `None` when `ALIGNER_EMAIL` / `ALIGNER_PASSWORD` are not set.
    pub fn from_env(client: reqwest::Client) -> Option<Self> {
        let var = |name| std::env::var(name).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
        Some(Self { client, email: var("ALIGNER_EMAIL")?, password: var("ALIGNER_PASSWORD")?, token: Mutex::new(None) })
    }

    /// Returns a valid ID token, signing in again when it is missing, old, or `fresh` is asked.
    async fn token(&self, fresh: bool) -> Result<String> {
        let mut slot = self.token.lock().await;
        if let Some(t) = slot.as_ref().filter(|t| !fresh && !needs_refresh(t.expires, Instant::now())) {
            return Ok(t.id.clone());
        }
        let res = self
            .client
            .post(format!("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key={FIREBASE_KEY}"))
            .json(&json!({ "email": self.email, "password": self.password, "returnSecureToken": true }))
            .send()
            .await
            .context("Firebase sign-in request failed")?;
        let ok = res.status().is_success();
        let body: Value = res.json().await.unwrap_or(Value::Null);
        if !ok {
            anyhow::bail!("Firebase sign-in refused: {}", firebase_error(&body));
        }
        let (id, lifetime) = parse_sign_in(&body)?;
        *slot = Some(Token { id: id.clone(), expires: Instant::now() + lifetime });
        Ok(id)
    }

    /// Checks the credentials once at startup.
    pub async fn sign_in(&self) -> Result<()> {
        self.token(true).await.map(|_| ())
    }

    /// Writes `config/aligner` = { url, updatedAt } (url "" means offline).
    pub async fn publish(&self, url: &str) -> Result<()> {
        let endpoint = format!(
            "https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}/databases/(default)/documents/config/aligner"
        );
        let body = json!({ "fields": {
            "url": { "stringValue": url },
            "updatedAt": { "integerValue": now_ms().to_string() },
        }});
        let mut fresh = false;
        loop {
            let token = self.token(fresh).await?;
            let res = self.client.patch(&endpoint).bearer_auth(token).json(&body).send().await?;
            let status = res.status();
            if status.is_success() {
                return Ok(());
            }
            // Expired or revoked token: sign in again, once.
            if status == reqwest::StatusCode::UNAUTHORIZED && !fresh {
                fresh = true;
                continue;
            }
            let text = res.text().await.unwrap_or_default();
            if status == reqwest::StatusCode::FORBIDDEN {
                anyhow::bail!(
                    "Firestore refused the write (403): this account's uid must be in services/aligner \
                     and the current firestore.rules must be deployed. {text}"
                );
            }
            anyhow::bail!("Firestore {status}: {text}");
        }
    }
}

fn needs_refresh(expires: Instant, now: Instant) -> bool {
    expires.saturating_duration_since(now) < TOKEN_MARGIN
}

/// `{ idToken, expiresIn: "3600" }` from accounts:signInWithPassword.
fn parse_sign_in(body: &Value) -> Result<(String, Duration)> {
    let id = body["idToken"].as_str().filter(|s| !s.is_empty()).ok_or_else(|| anyhow!("no idToken in the answer"))?;
    let secs = body["expiresIn"].as_str().and_then(|s| s.parse().ok()).unwrap_or(3600);
    Ok((id.to_string(), Duration::from_secs(secs)))
}

/// `{ error: { message: "INVALID_LOGIN_CREDENTIALS" } }` -> a readable reason.
fn firebase_error(body: &Value) -> String {
    let code = body["error"]["message"].as_str().unwrap_or("unknown error");
    let hint = match code.split(' ').next().unwrap_or("") {
        "INVALID_LOGIN_CREDENTIALS" | "INVALID_PASSWORD" | "EMAIL_NOT_FOUND" | "INVALID_EMAIL" => {
            " (check ALIGNER_EMAIL / ALIGNER_PASSWORD)"
        }
        "USER_DISABLED" => " (the account is disabled in Firebase)",
        "TOO_MANY_ATTEMPTS_TRY_LATER" => " (too many attempts, try again later)",
        _ => "",
    };
    format!("{code}{hint}")
}

/// Re-publishes the address every minute, so the site can tell a live server from a stale one.
pub async fn heartbeat(publisher: Arc<Publisher>, url: String) {
    loop {
        if let Err(e) = publisher.publish(&url).await {
            tracing::warn!("could not publish the tunnel address: {e:#}");
        }
        tokio::time::sleep(HEARTBEAT).await;
    }
}

/// Verifies a caller's Firebase ID token when requests come through the public tunnel.
pub async fn verify_user_token(client: &reqwest::Client, id_token: &str) -> bool {
    let tok = id_token.trim();
    if tok.len() < 40 || tok.len() > 8192 {
        return false;
    }
    let res = client
        .post(format!(
            "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key={FIREBASE_KEY}"
        ))
        .timeout(Duration::from_secs(6))
        .json(&json!({ "idToken": tok }))
        .send()
        .await;
    let Ok(resp) = res else { return false };
    if !resp.status().is_success() {
        return false;
    }
    let body: Value = resp.json().await.unwrap_or(Value::Null);
    let Some(user) = body["users"].as_array().and_then(|u| u.first()) else {
        return false;
    };
    user["localId"].as_str().map(|s| !s.is_empty()).unwrap_or(false)
        && !user["disabled"].as_bool().unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_sign_in_answer() {
        let body = json!({ "idToken": "abc", "expiresIn": "3600", "refreshToken": "r" });
        let (id, life) = parse_sign_in(&body).unwrap();
        assert_eq!((id.as_str(), life), ("abc", Duration::from_secs(3600)));
        assert!(parse_sign_in(&json!({ "expiresIn": "3600" })).is_err());
    }

    #[test]
    fn explains_sign_in_errors() {
        let body = json!({ "error": { "code": 400, "message": "INVALID_LOGIN_CREDENTIALS" } });
        assert!(firebase_error(&body).contains("ALIGNER_PASSWORD"));
        assert_eq!(firebase_error(&Value::Null), "unknown error");
    }

    #[test]
    fn signs_in_again_before_the_token_expires() {
        let now = Instant::now();
        assert!(!needs_refresh(now + Duration::from_secs(3600), now));
        assert!(needs_refresh(now + Duration::from_secs(60), now));
        assert!(needs_refresh(now, now + Duration::from_secs(1)));
    }

    #[test]
    fn finds_url_in_cloudflared_banner() {
        let line = "2026-11-07T10:00:00Z INF |  https://brave-cat-lake-river.trycloudflare.com                             |";
        assert_eq!(find_tunnel_url(line).as_deref(), Some("https://brave-cat-lake-river.trycloudflare.com"));
        assert_eq!(find_tunnel_url("INF Requesting new quick Tunnel on trycloudflare.com..."), None);
        assert_eq!(find_tunnel_url("see https://developers.cloudflare.com/docs"), None);
    }
}
