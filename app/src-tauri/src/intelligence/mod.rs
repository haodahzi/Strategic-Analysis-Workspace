pub mod database;
pub mod fetch;
pub mod snapshot;

use tauri::{AppHandle, Manager, State};

use database::{DatabaseState, IntelligenceHealth};
use fetch::{FetchSourceRequest, FetchSourceResult};

fn database_error_to_public(_error: &database::DatabaseError) -> String {
    "database_unavailable".into()
}

#[tauri::command]
pub fn intelligence_health(
    app: AppHandle,
    state: State<'_, DatabaseState>,
) -> Result<IntelligenceHealth, String> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|_| "database_unavailable".to_string())?
        .join("intelligence");

    state
        .initialize(&data_dir)
        .map_err(|error| database_error_to_public(&error))
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
        .map_err(|_| "database_unavailable".to_string())?
        .join("intelligence");
    state
        .initialize(&data_dir)
        .map_err(|error| database_error_to_public(&error))?;

    let (target, pins) = fetch::resolve_source_target(&state, &request, |host, port| async move {
        let addresses = tokio::net::lookup_host((host.as_str(), port))
            .await
            .map_err(|error| fetch::FetchError::Network(error.to_string()))?
            .map(|address| address.ip())
            .collect();
        Ok(addresses)
    })
    .await
    .map_err(|error| error.public_message())?;
    let client =
        fetch::build_client_for_target(&target, &pins).map_err(|error| error.public_message())?;
    fetch::download_and_snapshot(&client, &target, &data_dir)
        .await
        .map_err(|error| error.public_message())
}

#[cfg(test)]
mod tests {
    use std::{io, path::PathBuf};

    use serde_json::json;

    use super::{
        database::{DatabaseError, IntelligenceHealth},
        database_error_to_public,
    };

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

    #[test]
    fn intelligence_command_database_errors_are_stable_and_redacted() {
        let error = DatabaseError::Io(io::Error::new(
            io::ErrorKind::PermissionDenied,
            r"C:\private\intelligence\TOP_SECRET_QUERY\competitive-intelligence.db",
        ));
        let public = database_error_to_public(&error);
        assert_eq!(public, "database_unavailable");
        assert!(!public.contains("TOP_SECRET_QUERY"));
        assert!(!public.contains(r"C:\private\intelligence"));
    }
}
