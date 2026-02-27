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
    stored_at: Instant,
    expires_at: Instant,
}

#[derive(Debug, Clone)]
pub struct CachedSnapshot {
    pub snapshot: ProviderSnapshot,
    pub stale: bool,
    pub age_seconds: u64,
}

#[derive(Clone, Default)]
pub struct QuotaCache {
    inner: Arc<Mutex<HashMap<String, CacheEntry>>>,
}

impl QuotaCache {
    pub fn get(&self, provider: &str) -> Option<CachedSnapshot> {
        let guard = self.inner.lock().ok()?;
        let now = Instant::now();
        guard.get(provider).map(|entry| CachedSnapshot {
            snapshot: entry.snapshot.clone(),
            stale: entry.expires_at <= now,
            age_seconds: now.saturating_duration_since(entry.stored_at).as_secs(),
        })
    }

    pub fn set(&self, provider: &str, snapshot: ProviderSnapshot) {
        if let Ok(mut guard) = self.inner.lock() {
            let now = Instant::now();
            guard.insert(
                provider.to_string(),
                CacheEntry {
                    snapshot,
                    stored_at: now,
                    expires_at: now + Duration::from_secs(300),
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
        let cached = cache.get("codex");
        assert!(cached.is_some());
        assert!(!cached.expect("cache should exist").stale);
        cache.clear(Some("codex"));
        assert!(cache.get("codex").is_none());
    }
}
