use super::{AuthMethod, CostData, Provider, Result, UsageData};

#[derive(Default)]
pub struct CursorProvider;

impl Provider for CursorProvider {
    async fn name(&self) -> &str {
        "cursor"
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        Ok(UsageData {
            provider: "cursor".to_string(),
            requests: 54,
            tokens: 18_600,
            period_start: "2026-02-01T00:00:00Z".to_string(),
            period_end: "2026-02-27T23:59:59Z".to_string(),
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        Ok(Some(CostData {
            provider: "cursor".to_string(),
            currency: "USD".to_string(),
            total: 15.38,
            period_start: "2026-02-01T00:00:00Z".to_string(),
            period_end: "2026-02-27T23:59:59Z".to_string(),
        }))
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::Token
    }
}
