use keyring::Entry;
use serde::Deserialize;

const DEFAULT_SERVICE: &str = "com.zhanlue.workbench.llm";
const INVALID_PROVIDER: &str = "invalid provider id";
const INVALID_SECRET: &str = "secret must not be blank";
const SECRET_READ_FAILED: &str = "secure credential read failed";
const SECRET_WRITE_FAILED: &str = "secure credential write failed";
const SECRET_DELETE_FAILED: &str = "secure credential delete failed";

fn service_name(build_override: Option<&'static str>) -> &'static str {
    match build_override {
        Some(value) if !value.trim().is_empty() => value,
        _ => DEFAULT_SERVICE,
    }
}

fn credential_service() -> &'static str {
    service_name(option_env!("WORKBENCH_CREDENTIAL_SERVICE"))
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BackendError {
    NoEntry,
    Failed,
}

trait CredentialBackend {
    fn get(&self, provider_id: &str) -> Result<String, BackendError>;
    fn set(&self, provider_id: &str, secret: &str) -> Result<(), BackendError>;
    fn delete(&self, provider_id: &str) -> Result<(), BackendError>;
}

struct NativeCredentialBackend;

impl NativeCredentialBackend {
    fn entry(provider_id: &str) -> Result<Entry, BackendError> {
        Entry::new(credential_service(), provider_id).map_err(|_| BackendError::Failed)
    }
}

impl CredentialBackend for NativeCredentialBackend {
    fn get(&self, provider_id: &str) -> Result<String, BackendError> {
        Self::entry(provider_id)?
            .get_password()
            .map_err(|error| match error {
                keyring::Error::NoEntry => BackendError::NoEntry,
                _ => BackendError::Failed,
            })
    }

    fn set(&self, provider_id: &str, secret: &str) -> Result<(), BackendError> {
        Self::entry(provider_id)?
            .set_password(secret)
            .map_err(|_| BackendError::Failed)
    }

    fn delete(&self, provider_id: &str) -> Result<(), BackendError> {
        Self::entry(provider_id)?
            .delete_credential()
            .map_err(|error| match error {
                keyring::Error::NoEntry => BackendError::NoEntry,
                _ => BackendError::Failed,
            })
    }
}

fn validate_provider(provider_id: &str) -> Result<(), String> {
    if provider_id.is_empty()
        || !provider_id
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
    {
        return Err(INVALID_PROVIDER.to_string());
    }
    Ok(())
}

fn get_with(backend: &impl CredentialBackend, provider_id: &str) -> Result<Option<String>, String> {
    validate_provider(provider_id)?;
    match backend.get(provider_id) {
        Ok(secret) => Ok(Some(secret)),
        Err(BackendError::NoEntry) => Ok(None),
        Err(BackendError::Failed) => Err(SECRET_READ_FAILED.to_string()),
    }
}

fn set_with(
    backend: &impl CredentialBackend,
    provider_id: &str,
    secret: &str,
) -> Result<(), String> {
    validate_provider(provider_id)?;
    if secret.trim().is_empty() {
        return Err(INVALID_SECRET.to_string());
    }
    backend
        .set(provider_id, secret)
        .map_err(|_| SECRET_WRITE_FAILED.to_string())
}

fn delete_with(backend: &impl CredentialBackend, provider_id: &str) -> Result<(), String> {
    validate_provider(provider_id)?;
    match backend.delete(provider_id) {
        Ok(()) | Err(BackendError::NoEntry) => Ok(()),
        Err(BackendError::Failed) => Err(SECRET_DELETE_FAILED.to_string()),
    }
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct ProviderSecretRequest {
    provider_id: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct SetProviderSecretRequest {
    provider_id: String,
    secret: String,
}

#[tauri::command]
pub fn get_provider_secret(request: ProviderSecretRequest) -> Result<Option<String>, String> {
    get_with(&NativeCredentialBackend, &request.provider_id)
}

#[tauri::command]
pub fn set_provider_secret(request: SetProviderSecretRequest) -> Result<(), String> {
    set_with(
        &NativeCredentialBackend,
        &request.provider_id,
        &request.secret,
    )
}

#[tauri::command]
pub fn delete_provider_secret(request: ProviderSecretRequest) -> Result<(), String> {
    delete_with(&NativeCredentialBackend, &request.provider_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::cell::RefCell;

    #[test]
    fn credential_service_uses_default_or_non_blank_build_override() {
        assert_eq!(service_name(None), "com.zhanlue.workbench.llm");
        assert_eq!(
            service_name(Some("com.zhanlue.workbench.intelligence-test.llm")),
            "com.zhanlue.workbench.intelligence-test.llm"
        );
        assert_eq!(service_name(Some("   ")), "com.zhanlue.workbench.llm");
    }

    struct FakeBackend {
        value: RefCell<Result<String, BackendError>>,
        set_result: RefCell<Result<(), BackendError>>,
        delete_result: RefCell<Result<(), BackendError>>,
        writes: RefCell<Vec<(String, String)>>,
    }

    impl Default for FakeBackend {
        fn default() -> Self {
            Self {
                value: RefCell::new(Err(BackendError::NoEntry)),
                set_result: RefCell::new(Ok(())),
                delete_result: RefCell::new(Ok(())),
                writes: RefCell::new(Vec::new()),
            }
        }
    }

    impl CredentialBackend for FakeBackend {
        fn get(&self, _provider_id: &str) -> Result<String, BackendError> {
            self.value.borrow().clone()
        }
        fn set(&self, provider_id: &str, secret: &str) -> Result<(), BackendError> {
            self.writes
                .borrow_mut()
                .push((provider_id.to_string(), secret.to_string()));
            *self.set_result.borrow()
        }
        fn delete(&self, _provider_id: &str) -> Result<(), BackendError> {
            *self.delete_result.borrow()
        }
    }

    #[test]
    fn provider_ids_are_strictly_validated() {
        let backend = FakeBackend::default();
        for invalid in ["", " openai", "open_ai", "open.ai", "中文"] {
            assert_eq!(
                get_with(&backend, invalid),
                Err(INVALID_PROVIDER.to_string())
            );
        }
        assert_ne!(
            get_with(&backend, "open-ai"),
            Err(INVALID_PROVIDER.to_string())
        );
    }

    #[test]
    fn missing_entries_are_absent() {
        let backend = FakeBackend {
            value: RefCell::new(Err(BackendError::NoEntry)),
            ..Default::default()
        };
        assert_eq!(get_with(&backend, "openai"), Ok(None));
    }

    #[test]
    fn deleting_a_missing_entry_is_idempotent() {
        let backend = FakeBackend {
            delete_result: RefCell::new(Err(BackendError::NoEntry)),
            ..Default::default()
        };
        assert_eq!(delete_with(&backend, "openai"), Ok(()));
    }

    #[test]
    fn blank_secrets_are_rejected_without_touching_backend() {
        let backend = FakeBackend::default();
        assert_eq!(
            set_with(&backend, "openai", "  "),
            Err(INVALID_SECRET.to_string())
        );
        assert!(backend.writes.borrow().is_empty());
    }

    #[test]
    fn backend_errors_are_fixed_and_do_not_contain_secret_values() {
        let secret = "sentinel-secret-never-leak";
        let backend = FakeBackend {
            value: RefCell::new(Err(BackendError::Failed)),
            set_result: RefCell::new(Err(BackendError::Failed)),
            delete_result: RefCell::new(Err(BackendError::Failed)),
            ..Default::default()
        };
        for error in [
            get_with(&backend, "openai").unwrap_err(),
            set_with(&backend, "openai", secret).unwrap_err(),
            delete_with(&backend, "openai").unwrap_err(),
        ] {
            assert!(!error.contains(secret));
            assert!(!error.contains("platform"));
        }
    }

    #[test]
    fn command_requests_use_camel_case_and_reject_unknown_fields() {
        assert!(
            serde_json::from_value::<ProviderSecretRequest>(serde_json::json!({
                "providerId": "openai"
            }))
            .is_ok()
        );
        assert!(
            serde_json::from_value::<ProviderSecretRequest>(serde_json::json!({
                "provider_id": "openai"
            }))
            .is_err()
        );
        assert!(
            serde_json::from_value::<SetProviderSecretRequest>(serde_json::json!({
                "providerId": "openai",
                "secret": "not-logged",
                "unexpected": true
            }))
            .is_err()
        );
    }
}
