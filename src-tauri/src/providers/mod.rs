pub mod claude;
pub mod codex;
pub mod copilot;
pub mod cursor;
pub mod gemini;
pub mod kiro;

use serde::{Deserialize, Serialize};
use thiserror::Error;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AuthMethod {
    ApiKey,
    OAuth,
    Token,
    None,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct UsageData {
    pub provider: String,
    pub requests: u64,
    pub tokens: u64,
    pub period_start: String,
    pub period_end: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct CostData {
    pub provider: String,
    pub currency: String,
    pub total: f64,
    pub period_start: String,
    pub period_end: String,
}

#[derive(Debug, Error)]
pub enum ProviderError {
    #[error("provider operation failed: {0}")]
    Operation(String),
}

pub type Result<T> = std::result::Result<T, ProviderError>;

#[allow(async_fn_in_trait)]
pub trait Provider: Send + Sync {
    async fn name(&self) -> &str;
    async fn fetch_usage(&self) -> Result<UsageData>;
    async fn fetch_cost(&self) -> Result<Option<CostData>>;
    fn auth_method(&self) -> AuthMethod;
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::claude::ClaudeProvider;
    use crate::providers::codex::CodexProvider;
    use crate::providers::copilot::CopilotProvider;
    use crate::providers::cursor::CursorProvider;
    use crate::providers::gemini::GeminiProvider;
    use crate::providers::kiro::KiroProvider;

    async fn assert_provider_stub<P: Provider>(provider: &P) {
        let name = provider.name().await;
        assert!(!name.is_empty());

        let usage = provider
            .fetch_usage()
            .await
            .expect("stub usage should succeed");
        assert_eq!(usage.provider, name);
        assert!(usage.requests > 0);

        let cost = provider
            .fetch_cost()
            .await
            .expect("stub cost should succeed");
        if let Some(cost_data) = cost {
            assert_eq!(cost_data.provider, name);
            assert!(cost_data.total >= 0.0);
        }
    }

    #[tokio::test]
    async fn stubs_return_expected_shapes() {
        assert_provider_stub(&CodexProvider).await;
        assert_provider_stub(&ClaudeProvider).await;
        assert_provider_stub(&GeminiProvider).await;
        assert_provider_stub(&KiroProvider).await;
        assert_provider_stub(&CopilotProvider).await;
        assert_provider_stub(&CursorProvider).await;
    }
}
