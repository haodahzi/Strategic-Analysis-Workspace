pub mod database;
pub mod fetch;
pub mod snapshot;

use tauri::{AppHandle, Manager, State};

use database::{DatabaseState, IntelligenceHealth};
use fetch::{FetchSourceRequest, FetchSourceResult};

#[tauri::command]
pub fn intelligence_health(
    app: AppHandle,
    state: State<'_, DatabaseState>,
) -> Result<IntelligenceHealth, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("intelligence");

    state
        .initialize(&data_dir)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn fetch_source_snapshot(
    app: AppHandle,
    state: State<'_, DatabaseState>,
    request: FetchSourceRequest,
) -> Result<FetchSourceResult, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("intelligence");
    state
        .initialize(&data_dir)
        .map_err(|error| error.to_string())?;

    let (target, pins) = fetch::resolve_source_target(&state, &request, |host, port| async move {
        let addresses = tokio::net::lookup_host((host.as_str(), port))
            .await
            .map_err(|error| fetch::FetchError::Network(error.to_string()))?
            .map(|address| address.ip())
            .collect();
        Ok(addresses)
    })
    .await
    .map_err(|error| error.to_string())?;
    let client =
        fetch::build_client_for_target(&target, &pins).map_err(|error| error.to_string())?;
    fetch::download_and_snapshot(&client, &target, &data_dir)
        .await
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use std::path::PathBuf;

    use serde_json::json;

    use super::database::IntelligenceHealth;

    #[test]
    fn health_serializes_with_camel_case_fields() {
        let health = IntelligenceHealth {
            ready: true,
            schema_version: 1,
            data_dir: PathBuf::from("intelligence-data"),
        };
        let value = serde_json::to_value(health).unwrap();

        assert_eq!(
            value,
            json!({
                "ready": true,
                "schemaVersion": 1,
                "dataDir": "intelligence-data",
            })
        );
    }
}
