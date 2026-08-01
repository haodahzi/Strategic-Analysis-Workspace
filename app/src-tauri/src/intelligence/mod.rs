pub mod database;

use tauri::{AppHandle, Manager, State};

use database::{DatabaseState, IntelligenceHealth};

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
