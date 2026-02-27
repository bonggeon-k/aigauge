use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};

use crate::providers::{CostData, ProviderInfo, QuotaLimit, UsageData};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderSnapshot {
    pub info: ProviderInfo,
    pub usage: UsageData,
    pub quota: QuotaLimit,
    pub cost: Option<CostData>,
}

#[derive(Debug, Clone)]
struct CacheEntry {
    snapshot: ProviderSnapshot,
    expires_at: Instant,
}

#[derive(Clone, Default)]
pub struct QuotaCache {
    inner: Arc<Mutex<HashMap<String, CacheEntry>>>,
}

impl QuotaCache {
    pub fn get(&self, provider: &str) -> Option<ProviderSnapshot> {
        let mut guard = self.inner.lock().ok()?;
        let now = Instant::now();
        if let Some(entry) = guard.get(provider) {
            if entry.expires_at > now {
                return Some(entry.snapshot.clone());
            }
        }
        guard.remove(provider);
        None
    }

    pub fn set(&self, provider: &str, snapshot: ProviderSnapshot) {
        if let Ok(mut guard) = self.inner.lock() {
            guard.insert(
                provider.to_string(),
                CacheEntry {
                    snapshot,
                    expires_at: Instant::now() + Duration::from_secs(300),
                },
            );
        }
    }

    pub fn clear(&self, provider: Option<&str>) {
        if let Ok(mut guard) = self.inner.lock() {
            if let Some(provider) = provider {
                guard.remove(provider);
            } else {
                guard.clear();
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::providers::{AuthMethod, ProviderStatus};

    fn snapshot() -> ProviderSnapshot {
        ProviderSnapshot {
            info: ProviderInfo {
                id: "codex".to_string(),
                name: "Codex".to_string(),
                icon: "bot".to_string(),
                auth_method: AuthMethod::ApiKey,
                plan_name: "Plus".to_string(),
                quota_limit: 100,
                reset_period: "weekly".to_string(),
            },
            usage: UsageData {
                provider: "codex".to_string(),
                requests: 40,
                tokens: 20,
                period_start: String::new(),
                period_end: String::new(),
                status: ProviderStatus::Ok,
            },
            quota: QuotaLimit {
                used: 40,
                limit: 100,
                unit: "percent".to_string(),
                reset_at: String::new(),
                status: ProviderStatus::Ok,
            },
            cost: None,
        }
    }

    #[test]
    fn stores_and_reads_until_ttl() {
        let cache = QuotaCache::default();
        cache.set("codex", snapshot());
        assert!(cache.get("codex").is_some());
        cache.clear(Some("codex"));
        assert!(cache.get("codex").is_none());
    }
}
