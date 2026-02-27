use super::{AuthMethod, CostData, Provider, Result, UsageData};

#[derive(Default)]
pub struct GeminiProvider;

impl Provider for GeminiProvider {
    async fn name(&self) -> &str {
        "gemini"
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        Ok(UsageData {
            provider: "gemini".to_string(),
            requests: 82,
            tokens: 29_500,
            period_start: "2026-02-01T00:00:00Z".to_string(),
            period_end: "2026-02-27T23:59:59Z".to_string(),
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        Ok(Some(CostData {
            provider: "gemini".to_string(),
            currency: "USD".to_string(),
            total: 22.08,
            period_start: "2026-02-01T00:00:00Z".to_string(),
            period_end: "2026-02-27T23:59:59Z".to_string(),
        }))
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::ApiKey
    }
}
