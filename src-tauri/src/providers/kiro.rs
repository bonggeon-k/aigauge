use super::{AuthMethod, CostData, Provider, Result, UsageData};

#[derive(Default)]
pub struct KiroProvider;

impl Provider for KiroProvider {
    async fn name(&self) -> &str {
        "kiro"
    }

    async fn fetch_usage(&self) -> Result<UsageData> {
        Ok(UsageData {
            provider: "kiro".to_string(),
            requests: 61,
            tokens: 21_400,
            period_start: "2026-02-01T00:00:00Z".to_string(),
            period_end: "2026-02-27T23:59:59Z".to_string(),
        })
    }

    async fn fetch_cost(&self) -> Result<Option<CostData>> {
        Ok(None)
    }

    fn auth_method(&self) -> AuthMethod {
        AuthMethod::Token
    }
}
