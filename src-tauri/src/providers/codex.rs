use super::{AuthMethod, CostData, Provider, Result, UsageData};

#[derive(Default)]
pub struct CodexProvider;

impl Provider for CodexProvider {
    async fn name(&self) -> &str {
        "codex"
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        Ok(UsageData {
            provider: "codex".to_string(),
            requests: 128,
            tokens: 48_200,
            period_start: "2026-02-01T00:00:00Z".to_string(),
            period_end: "2026-02-27T23:59:59Z".to_string(),
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        Ok(Some(CostData {
            provider: "codex".to_string(),
            currency: "USD".to_string(),
            total: 42.15,
            period_start: "2026-02-01T00:00:00Z".to_string(),
            period_end: "2026-02-27T23:59:59Z".to_string(),
        }))
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::ApiKey
    }
}
