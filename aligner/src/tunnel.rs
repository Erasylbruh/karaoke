//! Makes this computer reachable from the site on any device.
//!
//! Starts a Cloudflare quick tunnel (`cloudflared tunnel --url …`, free, no account) that gives
//! the local service a public https address, then publishes that address to Firestore
//! (`config/aligner`) and refreshes it every minute. The site reads the document and sends
//! auto-timing requests there, so a phone or another computer can use this PC as the server.

use std::process::Stdio;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result, anyhow};
use serde_json::json;
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};

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

/// Writes `config/aligner` = { url, updatedAt } (url "" means offline).
pub async fn publish(client: &reqwest::Client, url: &str) -> Result<()> {
    let endpoint = format!(
        "https://firestore.googleapis.com/v1/projects/{FIREBASE_PROJECT}/databases/(default)/documents/config/aligner?key={FIREBASE_KEY}"
    );
    let body = json!({ "fields": {
        "url": { "stringValue": url },
        "updatedAt": { "integerValue": now_ms().to_string() },
    }});
    let res = client.patch(endpoint).json(&body).send().await?;
    if !res.status().is_success() {
        anyhow::bail!("Firestore {}: {}", res.status(), res.text().await.unwrap_or_default());
    }
    Ok(())
}

/// Re-publishes the address every minute, so the site can tell a live server from a stale one.
pub async fn heartbeat(client: reqwest::Client, url: String) {
    loop {
        if let Err(e) = publish(&client, &url).await {
            tracing::warn!("could not publish the tunnel address: {e:#}");
        }
        tokio::time::sleep(HEARTBEAT).await;
    }
}

#[cfg(test)]
mod tests {
    use super::find_tunnel_url;

    #[test]
    fn finds_url_in_cloudflared_banner() {
        let line = "2026-11-07T10:00:00Z INF |  https://brave-cat-lake-river.trycloudflare.com                             |";
        assert_eq!(find_tunnel_url(line).as_deref(), Some("https://brave-cat-lake-river.trycloudflare.com"));
        assert_eq!(find_tunnel_url("INF Requesting new quick Tunnel on trycloudflare.com..."), None);
        assert_eq!(find_tunnel_url("see https://developers.cloudflare.com/docs"), None);
    }
}
