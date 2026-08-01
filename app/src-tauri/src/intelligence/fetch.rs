use std::{
    future::Future,
    net::{IpAddr, SocketAddr},
    path::Path,
    time::Duration,
};

use rusqlite::OptionalExtension;
use serde::{Deserialize, Serialize};
use url::Url;

use super::{database::DatabaseState, snapshot::store_snapshot};

pub const MAX_BODY_BYTES: usize = 5 * 1024 * 1024;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct FetchSourceRequest {
    pub source_id: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FetchSourceResult {
    pub final_url: String,
    pub status: u16,
    pub content_type: String,
    pub content_hash: String,
    pub snapshot_path: String,
    pub fetched_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ValidatedTarget {
    pub url: Url,
    pub host: String,
    pub port: u16,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SourceTarget {
    pub base_url: String,
    pub expected_host: String,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct ClientSecurityPolicy {
    pub proxy_disabled: bool,
    pub redirects_followed: usize,
    pub timeout: Duration,
    pub https_only: bool,
    pub automatic_decompression: bool,
}

trait ClientBuilderBoundary: Sized {
    fn disable_proxy(self) -> Self;
    fn set_https_only(self, enabled: bool) -> Self;
    fn disable_redirects(self) -> Self;
    fn set_timeout(self, timeout: Duration) -> Self;
    fn disable_automatic_decompression(self) -> Self;
    fn install_pins(self, host: &str, pins: &[SocketAddr]) -> Self;
}

impl ClientBuilderBoundary for reqwest::ClientBuilder {
    fn disable_proxy(self) -> Self {
        self.no_proxy()
    }
    fn set_https_only(self, enabled: bool) -> Self {
        self.https_only(enabled)
    }
    fn disable_redirects(self) -> Self {
        self.redirect(reqwest::redirect::Policy::none())
    }
    fn set_timeout(self, timeout: Duration) -> Self {
        self.timeout(timeout)
    }
    fn disable_automatic_decompression(self) -> Self {
        self.no_gzip().no_brotli().no_deflate().no_zstd()
    }
    fn install_pins(self, host: &str, pins: &[SocketAddr]) -> Self {
        self.resolve_to_addrs(host, pins)
    }
}

fn configure_client_builder<B: ClientBuilderBoundary>(
    builder: B,
    policy: &ClientSecurityPolicy,
    target: &ValidatedTarget,
    pins: &[SocketAddr],
) -> B {
    let builder = if policy.proxy_disabled {
        builder.disable_proxy()
    } else {
        builder
    };
    let builder = builder
        .set_https_only(policy.https_only)
        .set_timeout(policy.timeout)
        .install_pins(&target.host, pins);
    let builder = if policy.redirects_followed == 0 {
        builder.disable_redirects()
    } else {
        builder
    };
    if policy.automatic_decompression {
        builder
    } else {
        builder.disable_automatic_decompression()
    }
}

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum FetchError {
    #[error("fetch target is not allowed")]
    TargetNotAllowed,
    #[error("DNS did not return an address")]
    EmptyDns,
    #[error("DNS returned a blocked address")]
    BlockedAddress,
    #[error("response content type is not allowed")]
    ContentTypeNotAllowed,
    #[error("source is not enabled or does not exist")]
    SourceNotFound,
    #[error("response body exceeds 5 MiB")]
    BodyTooLarge,
    #[error("HTTP response was not successful: {0}")]
    HttpStatus(u16),
    #[error("network error: {0}")]
    Network(String),
    #[error("database error: {0}")]
    Database(String),
    #[error("snapshot error: {0}")]
    Snapshot(String),
}

pub fn lookup_source(state: &DatabaseState, source_id: &str) -> Result<SourceTarget, FetchError> {
    if source_id.trim().is_empty() {
        return Err(FetchError::SourceNotFound);
    }
    state
        .with_connection(|connection| {
            connection
                .query_row(
                    "SELECT base_url, expected_host FROM sources WHERE id = ?1 AND enabled = 1",
                    [source_id],
                    |row| {
                        Ok(SourceTarget {
                            base_url: row.get(0)?,
                            expected_host: row.get(1)?,
                        })
                    },
                )
                .optional()
                .map_err(super::database::DatabaseError::from)
        })
        .map_err(|error| FetchError::Database(error.to_string()))?
        .ok_or(FetchError::SourceNotFound)
}

pub async fn resolve_source_target<F, Fut>(
    state: &DatabaseState,
    request: &FetchSourceRequest,
    resolver: F,
) -> Result<(ValidatedTarget, Vec<SocketAddr>), FetchError>
where
    F: FnOnce(String, u16) -> Fut,
    Fut: Future<Output = Result<Vec<IpAddr>, FetchError>>,
{
    let source = lookup_source(state, &request.source_id)?;
    let target = validate_target(&source.base_url, &source.expected_host)?;
    let addresses = resolver(target.host.clone(), target.port).await?;
    let pins = validate_resolved_addresses(&target, addresses)?;
    Ok((target, pins))
}

fn client_security_policy(https_only: bool) -> ClientSecurityPolicy {
    ClientSecurityPolicy {
        proxy_disabled: true,
        redirects_followed: 0,
        timeout: Duration::from_secs(20),
        https_only,
        automatic_decompression: false,
    }
}

pub fn build_client_for_target(
    target: &ValidatedTarget,
    pins: &[SocketAddr],
) -> Result<reqwest::Client, FetchError> {
    build_client_with_policy(target, pins, &client_security_policy(true))
}

fn build_client_with_policy(
    target: &ValidatedTarget,
    pins: &[SocketAddr],
    policy: &ClientSecurityPolicy,
) -> Result<reqwest::Client, FetchError> {
    if pins.is_empty() {
        return Err(FetchError::EmptyDns);
    }
    configure_client_builder(reqwest::Client::builder(), policy, target, pins)
        .build()
        .map_err(|error| FetchError::Network(error.to_string()))
}

#[cfg(test)]
fn build_fixture_client_for_target(
    target: &ValidatedTarget,
    pins: &[SocketAddr],
) -> Result<reqwest::Client, FetchError> {
    build_client_with_policy(target, pins, &client_security_policy(false))
}

struct BodyLimiter {
    body: Vec<u8>,
}

impl BodyLimiter {
    fn new(content_length: Option<u64>) -> Result<Self, FetchError> {
        if content_length.is_some_and(|length| length > MAX_BODY_BYTES as u64) {
            return Err(FetchError::BodyTooLarge);
        }
        Ok(Self {
            body: Vec::with_capacity(
                content_length.unwrap_or(0).min(MAX_BODY_BYTES as u64) as usize
            ),
        })
    }

    fn push(&mut self, chunk: &[u8]) -> Result<(), FetchError> {
        let next_length = self
            .body
            .len()
            .checked_add(chunk.len())
            .ok_or(FetchError::BodyTooLarge)?;
        if next_length > MAX_BODY_BYTES {
            return Err(FetchError::BodyTooLarge);
        }
        self.body.extend_from_slice(chunk);
        Ok(())
    }

    fn finish(self) -> Vec<u8> {
        self.body
    }
}

#[cfg(test)]
pub fn read_body_from_chunks<I, B>(
    content_length: Option<u64>,
    chunks: I,
) -> Result<Vec<u8>, FetchError>
where
    I: IntoIterator<Item = B>,
    B: AsRef<[u8]>,
{
    let mut limiter = BodyLimiter::new(content_length)?;
    for chunk in chunks {
        limiter.push(chunk.as_ref())?;
    }
    Ok(limiter.finish())
}

pub async fn download_and_snapshot(
    client: &reqwest::Client,
    target: &ValidatedTarget,
    data_dir: &Path,
) -> Result<FetchSourceResult, FetchError> {
    let mut response = client
        .get(target.url.clone())
        .send()
        .await
        .map_err(|error| FetchError::Network(error.to_string()))?;
    let status = response.status().as_u16();
    if !response.status().is_success() {
        return Err(FetchError::HttpStatus(status));
    }
    let content_type = normalize_content_type(
        response
            .headers()
            .get(reqwest::header::CONTENT_TYPE)
            .and_then(|value| value.to_str().ok()),
    )?;
    let final_url = response.url().to_string();
    let mut limiter = BodyLimiter::new(response.content_length())?;
    while let Some(chunk) = response
        .chunk()
        .await
        .map_err(|error| FetchError::Network(error.to_string()))?
    {
        limiter.push(&chunk)?;
    }
    let body = limiter.finish();
    let snapshot =
        store_snapshot(data_dir, &body).map_err(|error| FetchError::Snapshot(error.to_string()))?;
    Ok(FetchSourceResult {
        final_url,
        status,
        content_type,
        content_hash: snapshot.content_hash,
        snapshot_path: snapshot.relative_path,
        fetched_at: chrono::Utc::now().to_rfc3339(),
    })
}

pub fn validate_target(base_url: &str, expected_host: &str) -> Result<ValidatedTarget, FetchError> {
    if expected_host.trim().is_empty() || !expected_host.is_ascii() {
        return Err(FetchError::TargetNotAllowed);
    }
    let url = Url::parse(base_url).map_err(|_| FetchError::TargetNotAllowed)?;
    let authority_has_at = base_url
        .split_once("://")
        .and_then(|(_, rest)| {
            rest.split(|character| matches!(character, '/' | '?' | '#'))
                .next()
        })
        .is_some_and(|authority| authority.contains('@'));
    if url.scheme() != "https"
        || authority_has_at
        || !url.username().is_empty()
        || url.password().is_some()
    {
        return Err(FetchError::TargetNotAllowed);
    }
    let host = url
        .host_str()
        .ok_or(FetchError::TargetNotAllowed)?
        .to_ascii_lowercase();
    if host != expected_host.to_ascii_lowercase() {
        return Err(FetchError::TargetNotAllowed);
    }
    let port = url
        .port_or_known_default()
        .ok_or(FetchError::TargetNotAllowed)?;
    Ok(ValidatedTarget { url, host, port })
}

pub fn validate_resolved_addresses(
    target: &ValidatedTarget,
    addresses: impl IntoIterator<Item = IpAddr>,
) -> Result<Vec<SocketAddr>, FetchError> {
    let mut pins = Vec::new();
    for address in addresses {
        if is_blocked_ip(address) {
            return Err(FetchError::BlockedAddress);
        }
        pins.push(SocketAddr::new(address, target.port));
    }
    if pins.is_empty() {
        return Err(FetchError::EmptyDns);
    }
    Ok(pins)
}

pub fn normalize_content_type(value: Option<&str>) -> Result<String, FetchError> {
    let mime = value
        .and_then(|value| value.split(';').next())
        .map(str::trim)
        .map(str::to_ascii_lowercase)
        .filter(|value| !value.is_empty())
        .ok_or(FetchError::ContentTypeNotAllowed)?;
    const ALLOWED: [&str; 6] = [
        "text/html",
        "application/xhtml+xml",
        "text/plain",
        "application/xml",
        "application/rss+xml",
        "application/atom+xml",
    ];
    if ALLOWED.contains(&mime.as_str()) {
        Ok(mime)
    } else {
        Err(FetchError::ContentTypeNotAllowed)
    }
}

fn is_blocked_ip(address: IpAddr) -> bool {
    match address {
        IpAddr::V4(address) => is_blocked_ipv4(address),
        IpAddr::V6(address) => is_blocked_ipv6(address),
    }
}

fn is_blocked_ipv4(address: std::net::Ipv4Addr) -> bool {
    let [a, b, c, _] = address.octets();
    a == 0
        || a == 10
        || a == 127
        || (a == 100 && (64..=127).contains(&b))
        || (a == 169 && b == 254)
        || (a == 172 && (16..=31).contains(&b))
        || (a == 192 && b == 0 && c == 0)
        || (a == 192 && b == 0 && c == 2)
        || (a == 192 && b == 88 && c == 99)
        || (a == 192 && b == 168)
        || (a == 198 && (b == 18 || b == 19))
        || (a == 198 && b == 51 && c == 100)
        || (a == 203 && b == 0 && c == 113)
        || a >= 224
}

fn embedded_ipv4(segments: [u16; 8], start: usize) -> std::net::Ipv4Addr {
    let high = segments[start].to_be_bytes();
    let low = segments[start + 1].to_be_bytes();
    std::net::Ipv4Addr::new(high[0], high[1], low[0], low[1])
}

fn is_blocked_ipv6(address: std::net::Ipv6Addr) -> bool {
    let segments = address.segments();
    let first = segments[0];
    if address.is_unspecified()
        || address.is_loopback()
        || (first & 0xfe00) == 0xfc00
        || (first & 0xffc0) == 0xfe80
        || (first & 0xffc0) == 0xfec0
        || (first & 0xff00) == 0xff00
        || (segments[0] == 0x2001 && segments[1] == 0x0db8)
    {
        return true;
    }
    if let Some(v4) = address.to_ipv4() {
        return is_blocked_ipv4(v4);
    }
    if segments[0] == 0x0064 && segments[1] == 0xff9b && segments[2..6] == [0, 0, 0, 0] {
        return is_blocked_ipv4(embedded_ipv4(segments, 6));
    }
    if segments[0] == 0x0064 && segments[1] == 0xff9b && segments[2] == 1 {
        return is_blocked_ipv4(embedded_ipv4(segments, 6));
    }
    if segments[..6] == [0, 0, 0, 0, 0xffff, 0] {
        return is_blocked_ipv4(embedded_ipv4(segments, 6));
    }
    if segments[0] == 0x2002 {
        return is_blocked_ipv4(embedded_ipv4(segments, 1));
    }
    if segments[0] == 0x2001 && segments[1] == 0 {
        if is_blocked_ipv4(embedded_ipv4(segments, 2)) {
            return true;
        }
        let encoded = embedded_ipv4(segments, 6).octets();
        return is_blocked_ipv4(std::net::Ipv4Addr::new(
            !encoded[0],
            !encoded[1],
            !encoded[2],
            !encoded[3],
        ));
    }
    if (segments[4] == 0 || segments[4] == 0x0200) && segments[5] == 0x5efe {
        return is_blocked_ipv4(embedded_ipv4(segments, 6));
    }
    (first & 0xe000) != 0x2000
}

#[cfg(test)]
mod tests {
    use std::{
        fs,
        io::{Read, Write},
        net::{IpAddr, Ipv4Addr, Ipv6Addr, TcpListener},
        path::PathBuf,
        process,
        sync::{
            atomic::{AtomicUsize, Ordering},
            Arc,
        },
    };

    use serde_json::json;
    use url::Url;

    use super::{
        build_client_for_target, build_fixture_client_for_target, client_security_policy,
        configure_client_builder, download_and_snapshot, lookup_source, normalize_content_type,
        read_body_from_chunks, resolve_source_target, validate_resolved_addresses, validate_target,
        ClientBuilderBoundary, FetchError, FetchSourceRequest, FetchSourceResult, ValidatedTarget,
        MAX_BODY_BYTES,
    };
    use crate::intelligence::database::DatabaseState;

    static NEXT: AtomicUsize = AtomicUsize::new(0);

    fn initialized_state() -> (DatabaseState, PathBuf) {
        let data_dir = std::env::temp_dir().join(format!(
            "strategic-analysis-task4-fetch-{}-{}",
            process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        let state = DatabaseState::default();
        state.initialize(&data_dir).unwrap();
        (state, data_dir)
    }

    fn safe_remove_temp_directory(path: &std::path::Path, expected_prefix: &str) {
        let temp_root = fs::canonicalize(std::env::temp_dir()).unwrap();
        let resolved = fs::canonicalize(path).unwrap();
        assert_eq!(resolved.parent(), Some(temp_root.as_path()));
        assert!(resolved
            .file_name()
            .and_then(|name| name.to_str())
            .is_some_and(|name| name.starts_with(expected_prefix)));
        fs::remove_dir_all(resolved).unwrap();
    }

    fn add_source(
        state: &DatabaseState,
        id: &str,
        enabled: bool,
        base_url: &str,
        expected_host: &str,
    ) {
        state.with_connection(|connection| {
            connection.execute(
                "INSERT INTO sources (id, name, base_url, expected_host, enabled) VALUES (?1, ?1, ?2, ?3, ?4)",
                rusqlite::params![id, base_url, expected_host, enabled],
            ).map_err(crate::intelligence::database::DatabaseError::from)?;
            Ok(())
        }).unwrap();
    }

    #[test]
    fn request_accepts_only_source_id() {
        let request: FetchSourceRequest =
            serde_json::from_value(json!({"sourceId":"source-1"})).unwrap();
        assert_eq!(request.source_id, "source-1");
        assert!(serde_json::from_value::<FetchSourceRequest>(json!({
            "sourceId":"source-1", "url":"https://example.com"
        }))
        .is_err());
        assert!(serde_json::from_value::<FetchSourceRequest>(json!({
            "sourceId":"source-1", "expectedHost":"example.com"
        }))
        .is_err());
    }

    #[test]
    fn target_requires_https_no_credentials_and_exact_ascii_host() {
        assert!(validate_target("https://example.com/news", "EXAMPLE.COM").is_ok());
        assert!(validate_target(
            "https://example.com?contact=user@example.net",
            "example.com"
        )
        .is_ok());
        for (url, host) in [
            ("http://example.com", "example.com"),
            ("https://user:pass@example.com", "example.com"),
            ("https://example.net", "example.com"),
            ("https://example.com", ""),
        ] {
            assert_eq!(
                validate_target(url, host),
                Err(FetchError::TargetNotAllowed)
            );
        }
    }

    #[test]
    fn rejects_blocked_ipv4_ipv6_mapped_and_any_mixed_set() {
        let target = validate_target("https://example.com", "example.com").unwrap();
        let blocked = [
            IpAddr::V4(Ipv4Addr::new(0, 1, 2, 3)),
            IpAddr::V4(Ipv4Addr::new(10, 0, 0, 1)),
            IpAddr::V4(Ipv4Addr::new(100, 64, 0, 1)),
            IpAddr::V4(Ipv4Addr::LOCALHOST),
            IpAddr::V4(Ipv4Addr::new(169, 254, 169, 254)),
            IpAddr::V4(Ipv4Addr::new(192, 0, 0, 1)),
            IpAddr::V4(Ipv4Addr::new(192, 0, 2, 1)),
            IpAddr::V4(Ipv4Addr::new(198, 18, 0, 1)),
            IpAddr::V4(Ipv4Addr::new(224, 0, 0, 1)),
            IpAddr::V4(Ipv4Addr::new(240, 0, 0, 1)),
            IpAddr::V6(Ipv6Addr::UNSPECIFIED),
            IpAddr::V6(Ipv6Addr::LOCALHOST),
            "fc00::1".parse().unwrap(),
            "fe80::1".parse().unwrap(),
            "fec0::1".parse().unwrap(),
            "ff00::1".parse().unwrap(),
            "2001:db8::1".parse().unwrap(),
            "::ffff:127.0.0.1".parse().unwrap(),
            "::127.0.0.1".parse().unwrap(),
            "::ffff:0:127.0.0.1".parse().unwrap(),
            "64:ff9b::127.0.0.1".parse().unwrap(),
            "64:ff9b:1::127.0.0.1".parse().unwrap(),
            "2002:7f00:1::1".parse().unwrap(),
            "2001:0:4136:e378:8000:63bf:80ff:fefe".parse().unwrap(),
            "2001:0:7f00:1:8000:63bf:22ff:ffff".parse().unwrap(),
            "2001:db9::5efe:127.0.0.1".parse().unwrap(),
        ];
        for address in blocked {
            assert_eq!(
                validate_resolved_addresses(&target, [address]),
                Err(FetchError::BlockedAddress),
                "{address}"
            );
        }
        assert_eq!(
            validate_resolved_addresses(
                &target,
                [
                    "93.184.216.34".parse().unwrap(),
                    "127.0.0.1".parse().unwrap()
                ]
            ),
            Err(FetchError::BlockedAddress)
        );
        assert_eq!(
            validate_resolved_addresses(&target, []),
            Err(FetchError::EmptyDns)
        );
    }

    #[test]
    fn accepts_public_addresses_and_uses_target_port_for_every_pin() {
        let target = validate_target("https://example.com:8443/path", "example.com").unwrap();
        let pins = validate_resolved_addresses(
            &target,
            [
                "93.184.216.34".parse().unwrap(),
                "2606:2800:220:1:248:1893:25c8:1946".parse().unwrap(),
            ],
        )
        .unwrap();
        assert_eq!(pins.len(), 2);
        assert!(pins.iter().all(|pin| pin.port() == 8443));
    }

    #[test]
    fn mime_is_normalized_against_allowlist() {
        for mime in [
            "text/html",
            "application/xhtml+xml",
            "text/plain",
            "application/xml",
            "application/rss+xml",
            "application/atom+xml",
        ] {
            assert_eq!(
                normalize_content_type(Some(&format!("{mime}; charset=utf-8"))).unwrap(),
                mime
            );
        }
        assert!(normalize_content_type(None).is_err());
        assert!(normalize_content_type(Some("application/json")).is_err());
    }

    #[tokio::test]
    async fn unknown_disabled_and_blank_sources_never_call_resolver() {
        let (state, data_dir) = initialized_state();
        add_source(
            &state,
            "disabled",
            false,
            "https://disabled.example",
            "disabled.example",
        );
        let calls = Arc::new(AtomicUsize::new(0));
        for source_id in ["", "missing", "disabled"] {
            let calls_for_resolver = Arc::clone(&calls);
            let request = FetchSourceRequest {
                source_id: source_id.into(),
            };
            assert_eq!(
                resolve_source_target(&state, &request, move |_, _| async move {
                    calls_for_resolver.fetch_add(1, Ordering::SeqCst);
                    Ok(vec!["93.184.216.34".parse().unwrap()])
                })
                .await,
                Err(FetchError::SourceNotFound)
            );
        }
        assert_eq!(calls.load(Ordering::SeqCst), 0);
        drop(state);
        safe_remove_temp_directory(&data_dir, "strategic-analysis-task4-fetch-");
    }

    #[tokio::test]
    async fn enabled_source_uses_only_sqlite_url_and_host_then_installs_all_pins() {
        let (state, data_dir) = initialized_state();
        add_source(
            &state,
            "enabled",
            true,
            "https://configured.example:9443/news",
            "configured.example",
        );
        assert_eq!(
            lookup_source(&state, "enabled").unwrap().base_url,
            "https://configured.example:9443/news"
        );
        let request = FetchSourceRequest {
            source_id: "enabled".into(),
        };
        let (target, pins) = resolve_source_target(&state, &request, |host, port| async move {
            assert_eq!(host, "configured.example");
            assert_eq!(port, 9443);
            Ok(vec![
                "93.184.216.34".parse().unwrap(),
                "2606:2800:220:1:248:1893:25c8:1946".parse().unwrap(),
            ])
        })
        .await
        .unwrap();
        assert_eq!(target.url.as_str(), "https://configured.example:9443/news");
        assert_eq!(pins.len(), 2);
        assert!(pins.iter().all(|pin| pin.port() == 9443));
        drop(state);
        safe_remove_temp_directory(&data_dir, "strategic-analysis-task4-fetch-");
    }

    #[tokio::test]
    async fn database_lock_is_released_before_resolver_is_awaited() {
        let (state, data_dir) = initialized_state();
        add_source(
            &state,
            "enabled",
            true,
            "https://configured.example/news",
            "configured.example",
        );
        let request = FetchSourceRequest {
            source_id: "enabled".into(),
        };
        resolve_source_target(&state, &request, |_, _| async {
            state
                .with_connection(|connection| {
                    let count =
                        connection.query_row("SELECT COUNT(*) FROM sources", [], |row| {
                            row.get::<_, i64>(0)
                        })?;
                    assert_eq!(count, 1);
                    Ok(())
                })
                .unwrap();
            Ok(vec!["93.184.216.34".parse().unwrap()])
        })
        .await
        .unwrap();
        drop(state);
        safe_remove_temp_directory(&data_dir, "strategic-analysis-task4-fetch-");
    }

    #[test]
    fn client_policy_disables_proxy_redirects_decompression_and_has_security_limits() {
        let policy = client_security_policy(true);
        assert!(policy.proxy_disabled);
        assert_eq!(policy.redirects_followed, 0);
        assert_eq!(policy.timeout, std::time::Duration::from_secs(20));
        assert!(policy.https_only);
        assert!(!policy.automatic_decompression);

        #[derive(Default)]
        struct RecordingBuilder {
            calls: Vec<String>,
        }
        impl ClientBuilderBoundary for RecordingBuilder {
            fn disable_proxy(mut self) -> Self {
                self.calls.push("no_proxy".into());
                self
            }
            fn set_https_only(mut self, enabled: bool) -> Self {
                self.calls.push(format!("https_only:{enabled}"));
                self
            }
            fn disable_redirects(mut self) -> Self {
                self.calls.push("redirect:none".into());
                self
            }
            fn set_timeout(mut self, timeout: std::time::Duration) -> Self {
                self.calls.push(format!("timeout:{}", timeout.as_secs()));
                self
            }
            fn disable_automatic_decompression(mut self) -> Self {
                self.calls.push("decompression:none".into());
                self
            }
            fn install_pins(mut self, host: &str, pins: &[std::net::SocketAddr]) -> Self {
                self.calls.push(format!("pins:{host}:{}", pins.len()));
                self
            }
        }
        let target = ValidatedTarget {
            url: Url::parse("https://example.com").unwrap(),
            host: "example.com".into(),
            port: 443,
        };
        let pins = [
            "93.184.216.34:443".parse().unwrap(),
            "[2606:2800:220:1:248:1893:25c8:1946]:443".parse().unwrap(),
        ];
        let recording =
            configure_client_builder(RecordingBuilder::default(), &policy, &target, &pins);
        assert_eq!(
            recording.calls,
            [
                "no_proxy",
                "https_only:true",
                "timeout:20",
                "pins:example.com:2",
                "redirect:none",
                "decompression:none"
            ]
        );
    }

    fn serve_once(response: &'static [u8]) -> (u16, std::thread::JoinHandle<()>) {
        serve_once_owned(response.to_vec())
    }

    fn serve_once_owned(response: Vec<u8>) -> (u16, std::thread::JoinHandle<()>) {
        let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0)).unwrap();
        let port = listener.local_addr().unwrap().port();
        let handle = std::thread::spawn(move || {
            let (mut stream, _) = listener.accept().unwrap();
            let mut request = [0_u8; 2048];
            let _ = stream.read(&mut request).unwrap();
            let _ = stream.write_all(&response);
        });
        (port, handle)
    }

    #[tokio::test]
    async fn reqwest_uses_dns_override_and_does_not_follow_redirects() {
        let (port, server) = serve_once(b"HTTP/1.1 302 Found\r\nLocation: http://pinned.invalid/final\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
        let target = ValidatedTarget {
            url: Url::parse(&format!("http://pinned.invalid:{port}/start")).unwrap(),
            host: "pinned.invalid".into(),
            port,
        };
        let pins = vec![std::net::SocketAddr::new(
            IpAddr::V4(Ipv4Addr::LOCALHOST),
            port,
        )];
        let client = build_fixture_client_for_target(&target, &pins).unwrap();
        let response = client.get(target.url.clone()).send().await.unwrap();
        assert_eq!(response.status().as_u16(), 302);
        server.join().unwrap();
    }

    #[tokio::test]
    async fn production_client_rejects_http_even_with_an_installed_pin() {
        let target = ValidatedTarget {
            url: Url::parse("http://pinned.invalid/").unwrap(),
            host: "pinned.invalid".into(),
            port: 80,
        };
        let client =
            build_client_for_target(&target, &["93.184.216.34:80".parse().unwrap()]).unwrap();
        assert!(client.get(target.url).send().await.is_err());
    }

    struct CountingChunks {
        chunks: Vec<Vec<u8>>,
        polls: Arc<AtomicUsize>,
        index: usize,
    }

    impl Iterator for CountingChunks {
        type Item = Vec<u8>;
        fn next(&mut self) -> Option<Self::Item> {
            self.polls.fetch_add(1, Ordering::SeqCst);
            let item = self.chunks.get(self.index).cloned();
            self.index += usize::from(item.is_some());
            item
        }
    }

    #[test]
    fn declared_and_streamed_size_limits_stop_before_unneeded_body_polls() {
        let declared_polls = Arc::new(AtomicUsize::new(0));
        let declared = CountingChunks {
            chunks: vec![vec![1]],
            polls: Arc::clone(&declared_polls),
            index: 0,
        };
        assert_eq!(
            read_body_from_chunks(Some((MAX_BODY_BYTES + 1) as u64), declared),
            Err(FetchError::BodyTooLarge)
        );
        assert_eq!(declared_polls.load(Ordering::SeqCst), 0);

        let streamed_polls = Arc::new(AtomicUsize::new(0));
        let streamed = CountingChunks {
            chunks: vec![vec![0; MAX_BODY_BYTES], vec![1], vec![2]],
            polls: Arc::clone(&streamed_polls),
            index: 0,
        };
        assert_eq!(
            read_body_from_chunks(None, streamed),
            Err(FetchError::BodyTooLarge)
        );
        assert_eq!(streamed_polls.load(Ordering::SeqCst), 2);

        assert_eq!(
            read_body_from_chunks(None, [vec![0; MAX_BODY_BYTES]])
                .unwrap()
                .len(),
            MAX_BODY_BYTES
        );
    }

    #[test]
    fn result_serializes_exact_metadata_only_contract() {
        let value = serde_json::to_value(FetchSourceResult {
            final_url: "https://example.com/final".into(),
            status: 200,
            content_type: "text/html".into(),
            content_hash: "abc".into(),
            snapshot_path: "snapshots/abc.html.gz".into(),
            fetched_at: "2026-08-01T00:00:00Z".into(),
        })
        .unwrap();
        assert_eq!(
            value,
            json!({
                "finalUrl":"https://example.com/final", "status":200, "contentType":"text/html",
                "contentHash":"abc", "snapshotPath":"snapshots/abc.html.gz", "fetchedAt":"2026-08-01T00:00:00Z"
            })
        );
        assert!(value.get("body").is_none());
        assert!(value.get("absolutePath").is_none());
    }

    #[tokio::test]
    async fn redirect_is_not_a_snapshot_candidate() {
        let (port, server) = serve_once(b"HTTP/1.1 302 Found\r\nLocation: /final\r\nContent-Length: 4\r\nConnection: close\r\n\r\nbody");
        let target = ValidatedTarget {
            url: Url::parse(&format!("http://pinned.invalid:{port}/start")).unwrap(),
            host: "pinned.invalid".into(),
            port,
        };
        let client = build_fixture_client_for_target(
            &target,
            &[std::net::SocketAddr::new(
                IpAddr::V4(Ipv4Addr::LOCALHOST),
                port,
            )],
        )
        .unwrap();
        let data_dir = std::env::temp_dir().join(format!(
            "strategic-analysis-task4-redirect-{}-{}",
            process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        assert_eq!(
            download_and_snapshot(&client, &target, &data_dir).await,
            Err(FetchError::HttpStatus(302))
        );
        assert!(!data_dir.join("snapshots").exists());
        server.join().unwrap();
    }

    #[tokio::test]
    async fn successful_response_saves_raw_bytes_and_returns_only_logical_metadata() {
        let (port, server) = serve_once(b"HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: 5\r\nConnection: close\r\n\r\nhello");
        let target = ValidatedTarget {
            url: Url::parse(&format!("http://pinned.invalid:{port}/page")).unwrap(),
            host: "pinned.invalid".into(),
            port,
        };
        let client = build_fixture_client_for_target(
            &target,
            &[std::net::SocketAddr::new(
                IpAddr::V4(Ipv4Addr::LOCALHOST),
                port,
            )],
        )
        .unwrap();
        let data_dir = std::env::temp_dir().join(format!(
            "strategic-analysis-task4-success-{}-{}",
            process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        let result = download_and_snapshot(&client, &target, &data_dir)
            .await
            .unwrap();
        assert_eq!(result.status, 200);
        assert_eq!(result.content_type, "text/html");
        assert_eq!(
            result.snapshot_path,
            format!("snapshots/{}.html.gz", result.content_hash)
        );
        assert!(!result
            .snapshot_path
            .contains(data_dir.to_string_lossy().as_ref()));
        assert!(data_dir.join(&result.snapshot_path).is_file());
        server.join().unwrap();
        safe_remove_temp_directory(&data_dir, "strategic-analysis-task4-success-");
    }

    fn fixture_target(port: u16) -> (ValidatedTarget, reqwest::Client) {
        let target = ValidatedTarget {
            url: Url::parse(&format!("http://pinned.invalid:{port}/body")).unwrap(),
            host: "pinned.invalid".into(),
            port,
        };
        let client = build_fixture_client_for_target(
            &target,
            &[std::net::SocketAddr::new(
                IpAddr::V4(Ipv4Addr::LOCALHOST),
                port,
            )],
        )
        .unwrap();
        (target, client)
    }

    #[tokio::test]
    async fn production_download_enforces_declared_streaming_and_exact_size_limits() {
        let declared = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            MAX_BODY_BYTES + 1
        ).into_bytes();
        let (port, server) = serve_once_owned(declared);
        let (target, client) = fixture_target(port);
        let declared_dir = std::env::temp_dir().join(format!(
            "strategic-analysis-task4-declared-{}-{}",
            process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        assert_eq!(
            download_and_snapshot(&client, &target, &declared_dir).await,
            Err(FetchError::BodyTooLarge)
        );
        assert!(!declared_dir.exists());
        server.join().unwrap();

        let mut chunked = b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\nConnection: close\r\n\r\n".to_vec();
        chunked.extend_from_slice(format!("{:X}\r\n", MAX_BODY_BYTES).as_bytes());
        chunked.extend(std::iter::repeat(0_u8).take(MAX_BODY_BYTES));
        chunked.extend_from_slice(b"\r\n1\r\nx\r\n0\r\n\r\n");
        let (port, server) = serve_once_owned(chunked);
        let (target, client) = fixture_target(port);
        let chunked_dir = std::env::temp_dir().join(format!(
            "strategic-analysis-task4-chunked-{}-{}",
            process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        assert_eq!(
            download_and_snapshot(&client, &target, &chunked_dir).await,
            Err(FetchError::BodyTooLarge)
        );
        assert!(!chunked_dir.exists());
        server.join().unwrap();

        let mut exact = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/plain\r\nContent-Length: {}\r\nConnection: close\r\n\r\n",
            MAX_BODY_BYTES
        ).into_bytes();
        exact.extend(std::iter::repeat(b'a').take(MAX_BODY_BYTES));
        let (port, server) = serve_once_owned(exact);
        let (target, client) = fixture_target(port);
        let exact_dir = std::env::temp_dir().join(format!(
            "strategic-analysis-task4-exact-{}-{}",
            process::id(),
            NEXT.fetch_add(1, Ordering::SeqCst)
        ));
        let result = download_and_snapshot(&client, &target, &exact_dir)
            .await
            .unwrap();
        assert_eq!(result.status, 200);
        assert!(exact_dir.join(&result.snapshot_path).is_file());
        server.join().unwrap();
        safe_remove_temp_directory(&exact_dir, "strategic-analysis-task4-exact-");
    }
}
