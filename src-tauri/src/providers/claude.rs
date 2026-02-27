use super::{AuthMethod, CostData, Provider, Result, UsageData};

#[derive(Default)]
pub struct ClaudeProvider;

impl Provider for ClaudeProvider {
    async fn name(&self) -> &str {
        "claude"
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        Ok(UsageData {
            provider: "claude".to_string(),
            requests: 96,
            tokens: 36_800,
            period_start: "2026-02-01T00:00:00Z".to_string(),
            period_end: "2026-02-27T23:59:59Z".to_string(),
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        Ok(Some(CostData {
            provider: "claude".to_string(),
            currency: "USD".to_string(),
            total: 38.72,
            period_start: "2026-02-01T00:00:00Z".to_string(),
            period_end: "2026-02-27T23:59:59Z".to_string(),
        }))
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::ApiKey
    }
}
