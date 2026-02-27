use super::{AuthMethod, CostData, Provider, Result, UsageData};

#[derive(Default)]
pub struct CopilotProvider;

impl Provider for CopilotProvider {
    async fn name(&self) -> &str {
        "copilot"
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        Ok(UsageData {
            provider: "copilot".to_string(),
            requests: 73,
            tokens: 25_900,
            period_start: "2026-02-01T00:00:00Z".to_string(),
            period_end: "2026-02-27T23:59:59Z".to_string(),
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        Ok(Some(CostData {
            provider: "copilot".to_string(),
            currency: "USD".to_string(),
            total: 19.0,
            period_start: "2026-02-01T00:00:00Z".to_string(),
            period_end: "2026-02-27T23:59:59Z".to_string(),
        }))
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::OAuth
    }
}
