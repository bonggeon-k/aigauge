use anyhow::{anyhow, Result};
use keyring::{Entry, Error as KeyringError};
use std::sync::Arc;
use tracing::{debug, info, instrument};
use zeroize::{Zeroize, Zeroizing};

#[cfg(target_os = "linux")]
const DEFAULT_SERVICE_NAME: &str = "com.aigauge.desktop.linux";
#[cfg(target_os = "windows")]
const DEFAULT_SERVICE_NAME: &str = "AIGauge.Desktop.Windows";
#[cfg(target_os = "macos")]
const DEFAULT_SERVICE_NAME: &str = "com.aigauge.desktop.macos";
#[cfg(not(any(target_os = "linux", target_os = "windows", target_os = "macos")))]
const DEFAULT_SERVICE_NAME: &str = "com.aigauge.desktop";

pub trait KeyringBackend: Send + Sync {
    fn set_password(&self, service: &str, account: &str, password: &str) -> Result<()>;
    fn get_password(&self, service: &str, account: &str) -> Result<Option<String>>;
    fn delete_password(&self, service: &str, account: &str) -> Result<()>;
}

#[derive(Default)]
struct OsKeyringBackend;

impl KeyringBackend for OsKeyringBackend {
    fn set_password(&self, service: &str, account: &str, password: &str) -> Result<()> {
        let entry = Entry::new(service, account)?;
        entry.set_password(password)?;
        Ok(())
    }

    fn get_password(&self, service: &str, account: &str) -> Result<Option<String>> {
        let entry = Entry::new(service, account)?;
        match entry.get_password() {
            Ok(password) => Ok(Some(password)),
            Err(KeyringError::NoEntry) => Ok(None),
            Err(error) => Err(anyhow!(error)),
        }
    }

    fn delete_password(&self, service: &str, account: &str) -> Result<()> {
        let entry = Entry::new(service, account)?;
        match entry.delete_credential() {
            Ok(()) | Err(KeyringError::NoEntry) => Ok(()),
            Err(error) => Err(anyhow!(error)),
        }
    }
}

#[derive(Clone)]
pub struct CredentialManager {
    service_name: Zeroizing<String>,
    backend: Arc<dyn KeyringBackend>,
}

impl Default for CredentialManager {
    fn default() -> Self {
        Self {
            service_name: Zeroizing::new(DEFAULT_SERVICE_NAME.to_string()),
            backend: Arc::new(OsKeyringBackend),
        }
    }
}

impl CredentialManager {
    pub fn new() -> Self {
        Self::default()
    }

    #[cfg(test)]
    fn with_backend(service_name: &str, backend: Arc<dyn KeyringBackend>) -> Self {
        Self {
            service_name: Zeroizing::new(service_name.to_string()),
            backend,
        }
    }

    fn account_name(provider: &str) -> String {
        format!("provider::{provider}")
    }

    fn slot_account_name(provider: &str, slot: &str) -> String {
        format!("provider::{provider}::{slot}")
    }

    #[instrument(skip(self, secret), fields(provider = provider))]
    pub fn save_credential(&self, provider: &str, secret: String) -> Result<()> {
        let account = Self::account_name(provider);
        let mut secret_buffer = secret;
        self.backend.set_password(
            self.service_name.as_str(),
            account.as_str(),
            secret_buffer.as_str(),
        )?;
        secret_buffer.zeroize();
        info!(provider = provider, "credential saved");
        Ok(())
    }

    #[instrument(skip(self, secret), fields(provider = provider, slot = slot))]
    pub fn save_credential_for_slot(
        &self,
        provider: &str,
        slot: &str,
        secret: String,
    ) -> Result<()> {
        let account = Self::slot_account_name(provider, slot);
        let mut secret_buffer = secret;
        self.backend.set_password(
            self.service_name.as_str(),
            account.as_str(),
            secret_buffer.as_str(),
        )?;
        secret_buffer.zeroize();
        info!(provider = provider, slot = slot, "credential slot saved");
        Ok(())
    }

    #[instrument(skip(self), fields(provider = provider))]
    pub fn has_credential(&self, provider: &str) -> Result<bool> {
        let account = Self::account_name(provider);
        let mut credential = self
            .backend
            .get_password(self.service_name.as_str(), account.as_str())?;
        let has_credential = credential
            .as_ref()
            .map(|value| !value.is_empty())
            .unwrap_or(false);
        if let Some(value) = credential.as_mut() {
            value.zeroize();
        }
        debug!(
            provider = provider,
            found = has_credential,
            "credential presence checked"
        );
        Ok(has_credential)
    }

    #[instrument(skip(self), fields(provider = provider))]
    pub fn get_credential(&self, provider: &str) -> Result<Option<Zeroizing<String>>> {
        let account = Self::account_name(provider);
        let credential = self
            .backend
            .get_password(self.service_name.as_str(), account.as_str())?
            .map(Zeroizing::new);
        debug!(
            provider = provider,
            found = credential.is_some(),
            "credential loaded"
        );
        Ok(credential)
    }

    #[instrument(skip(self), fields(provider = provider, slot = slot))]
    pub fn get_credential_for_slot(
        &self,
        provider: &str,
        slot: &str,
    ) -> Result<Option<Zeroizing<String>>> {
        let account = Self::slot_account_name(provider, slot);
        let credential = self
            .backend
            .get_password(self.service_name.as_str(), account.as_str())?
            .map(Zeroizing::new);
        debug!(
            provider = provider,
            slot = slot,
            found = credential.is_some(),
            "credential slot loaded"
        );
        Ok(credential)
    }

    #[instrument(skip(self), fields(provider = provider))]
    pub fn delete_credential(&self, provider: &str) -> Result<()> {
        let account = Self::account_name(provider);
        self.backend
            .delete_password(self.service_name.as_str(), account.as_str())?;
        info!(provider = provider, "credential deleted");
        Ok(())
    }

    #[instrument(skip(self), fields(provider = provider, slot = slot))]
    pub fn delete_credential_for_slot(&self, provider: &str, slot: &str) -> Result<()> {
        let account = Self::slot_account_name(provider, slot);
        self.backend
            .delete_password(self.service_name.as_str(), account.as_str())?;
        info!(provider = provider, slot = slot, "credential slot deleted");
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;
    use std::sync::Mutex;

    #[derive(Default)]
    struct MockKeyring {
        entries: Mutex<HashMap<(String, String), String>>,
    }

    impl KeyringBackend for MockKeyring {
        fn set_password(&self, service: &str, account: &str, password: &str) -> Result<()> {
            let mut entries = self
                .entries
                .lock()
                .map_err(|_| anyhow!("mock lock poisoned while saving credential"))?;
            entries.insert(
                (service.to_string(), account.to_string()),
                password.to_string(),
            );
            Ok(())
        }

        fn get_password(&self, service: &str, account: &str) -> Result<Option<String>> {
            let entries = self
                .entries
                .lock()
                .map_err(|_| anyhow!("mock lock poisoned while loading credential"))?;
            Ok(entries
                .get(&(service.to_string(), account.to_string()))
                .map(ToString::to_string))
        }

        fn delete_password(&self, service: &str, account: &str) -> Result<()> {
            let mut entries = self
                .entries
                .lock()
                .map_err(|_| anyhow!("mock lock poisoned while deleting credential"))?;
            entries.remove(&(service.to_string(), account.to_string()));
            Ok(())
        }
    }

    #[test]
    fn save_has_delete_roundtrip() {
        let backend = Arc::new(MockKeyring::default());
        let manager = CredentialManager::with_backend("test.aigauge", backend);

        manager
            .save_credential("codex", "super-secret".to_string())
            .expect("save should succeed");

        let loaded = manager
            .has_credential("codex")
            .expect("lookup should succeed");
        assert!(loaded);

        manager
            .delete_credential("codex")
            .expect("delete should succeed");
        let missing = manager
            .has_credential("codex")
            .expect("lookup after delete should succeed");
        assert!(!missing);
    }

    #[test]
    fn get_credential_returns_value() {
        let backend = Arc::new(MockKeyring::default());
        let manager = CredentialManager::with_backend("test.aigauge", backend);
        manager
            .save_credential("claude", "token-123".to_string())
            .expect("save should succeed");

        let credential = manager
            .get_credential("claude")
            .expect("get credential should succeed");
        assert_eq!(
            credential.map(|value| value.to_string()),
            Some("token-123".to_string())
        );
    }

    #[test]
    fn slot_credentials_are_isolated() {
        let backend = Arc::new(MockKeyring::default());
        let manager = CredentialManager::with_backend("test.aigauge", backend);

        manager
            .save_credential_for_slot("codex", "api_key", "sk-api".to_string())
            .expect("slot save should succeed");
        manager
            .save_credential_for_slot("codex", "oauth_token", "oauth-token".to_string())
            .expect("slot save should succeed");

        let api = manager
            .get_credential_for_slot("codex", "api_key")
            .expect("api slot should load")
            .map(|value| value.to_string());
        let oauth = manager
            .get_credential_for_slot("codex", "oauth_token")
            .expect("oauth slot should load")
            .map(|value| value.to_string());
        assert_eq!(api.as_deref(), Some("sk-api"));
        assert_eq!(oauth.as_deref(), Some("oauth-token"));
    }
}
