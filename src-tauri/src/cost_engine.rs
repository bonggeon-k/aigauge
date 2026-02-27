use chrono::{DateTime, Datelike, NaiveDate, Utc};
use once_cell::sync::Lazy;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::BTreeMap;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant, SystemTime};
use tauri::Manager;
use tracing::instrument;

use crate::commands::{AppState, PROVIDER_IDS};
use crate::providers::home_dir;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProviderCost {
    pub provider: String,
    pub amount: f64,
    pub percentage_of_total: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CostSummary {
    pub total_monthly: f64,
    pub by_provider: Vec<ProviderCost>,
    pub currency: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthlyCostHistory {
    pub month: String,
    pub total: f64,
    pub by_provider: Vec<ProviderCost>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoiEntry {
    pub provider: String,
    pub cost_per_request: f64,
    pub cost_per_1k_tokens: f64,
    pub efficiency_score: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RoiAnalysis {
    pub entries: Vec<RoiEntry>,
    pub best_value_provider: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PaceAnalysis {
    pub monthly_budget: f64,
    pub spent_so_far: f64,
    pub projected_monthly_total: f64,
    pub on_track: bool,
}

#[derive(Debug, Clone, Default)]
pub struct CostEngine;

#[derive(Debug, Clone, Default)]
struct TokenTotals {
    input: u64,
    output: u64,
    reasoning_output: u64,
}

#[derive(Debug, Clone)]
struct CachedCodexCost {
    computed_at: Instant,
    total_cost: f64,
}

static CODEX_COST_CACHE: Lazy<Mutex<Option<CachedCodexCost>>> = Lazy::new(|| Mutex::new(None));

impl CostEngine {
    #[instrument(skip(self, state))]
    pub async fn summary(&self, state: &AppState) -> Result<CostSummary, String> {
        let codex_cost = self.codex_monthly_cost().unwrap_or(0.0);

        let mut total = 0.0;
        let mut by_provider = Vec::new();

        for provider in PROVIDER_IDS {
            let amount = if *provider == "codex" {
                codex_cost
            } else {
                state
                    .providers
                    .cost_for(provider)
                    .await
                    .map_err(|error| error.to_string())?
                    .map(|cost| cost.total)
                    .unwrap_or(0.0)
            };

            total += amount;
            by_provider.push(ProviderCost {
                provider: (*provider).to_string(),
                amount,
                percentage_of_total: 0.0,
            });
        }

        for item in &mut by_provider {
            item.percentage_of_total = if total > 0.0 {
                (item.amount / total) * 100.0
            } else {
                0.0
            };
        }

        Ok(CostSummary {
            total_monthly: total,
            by_provider,
            currency: "USD".to_string(),
        })
    }

    #[instrument(skip(self, app, summary))]
    pub fn persist_month(
        &self,
        app: &tauri::AppHandle,
        summary: &CostSummary,
    ) -> Result<Vec<MonthlyCostHistory>, String> {
        let path = Self::history_path(app)?;
        let mut history = Self::load_history_from_path(path.clone())?;

        let month = format!("{:04}-{:02}", Utc::now().year(), Utc::now().month());
        let entry = MonthlyCostHistory {
            month,
            total: summary.total_monthly,
            by_provider: summary.by_provider.clone(),
        };

        history.retain(|item| item.month != entry.month);
        history.push(entry);
        history = trim_history(history);

        let data = serde_json::to_string_pretty(&history)
            .map_err(|error| format!("failed to serialize cost history: {error}"))?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent)
                .map_err(|error| format!("failed to create cost history dir: {error}"))?;
        }
        fs::write(&path, data).map_err(|error| format!("failed to write cost history: {error}"))?;

        Ok(history)
    }

    #[instrument(skip(self, app))]
    pub fn load_history(&self, app: &tauri::AppHandle) -> Result<Vec<MonthlyCostHistory>, String> {
        let path = Self::history_path(app)?;
        Self::load_history_from_path(path)
    }

    #[instrument(skip(app))]
    pub fn history_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
        let dir = app
            .path()
            .app_data_dir()
            .map_err(|error| format!("failed to resolve app data dir: {error}"))?;
        Ok(dir.join("cost-history.json"))
    }

    fn load_history_from_path(path: PathBuf) -> Result<Vec<MonthlyCostHistory>, String> {
        if !path.exists() {
            return Ok(Vec::new());
        }

        let raw = fs::read_to_string(path)
            .map_err(|error| format!("failed to read cost history: {error}"))?;
        let history: Vec<MonthlyCostHistory> = serde_json::from_str(&raw)
            .map_err(|error| format!("failed to parse cost history: {error}"))?;
        Ok(trim_history(history))
    }

    #[instrument(skip(self, state))]
    pub async fn roi_analysis(&self, state: &AppState) -> Result<RoiAnalysis, String> {
        let summary = self.summary(state).await?;
        let costs_by_provider: BTreeMap<String, f64> = summary
            .by_provider
            .iter()
            .map(|item| (item.provider.clone(), item.amount))
            .collect();

        let mut rows = Vec::new();
        for provider in PROVIDER_IDS {
            let usage = state
                .providers
                .usage_for(provider)
                .await
                .map_err(|error| error.to_string())?;
            let cost = costs_by_provider.get(*provider).copied().unwrap_or(0.0);

            let cost_per_request = if usage.requests > 0 {
                cost / usage.requests as f64
            } else {
                0.0
            };
            let cost_per_1k_tokens = if usage.tokens > 0 {
                (cost / usage.tokens as f64) * 1000.0
            } else {
                0.0
            };
            let efficiency_score = if cost > 0.0 {
                (usage.requests as f64 + (usage.tokens as f64 / 1000.0)) / cost
            } else {
                0.0
            };

            rows.push(RoiEntry {
                provider: (*provider).to_string(),
                cost_per_request,
                cost_per_1k_tokens,
                efficiency_score,
            });
        }

        let best_value_provider = rows
            .iter()
            .filter(|row| row.efficiency_score.is_finite())
            .max_by(|a, b| a.efficiency_score.total_cmp(&b.efficiency_score))
            .map(|row| row.provider.clone());

        Ok(RoiAnalysis {
            entries: rows,
            best_value_provider,
        })
    }

    #[instrument(skip(self, state))]
    pub async fn pace_analysis(
        &self,
        state: &AppState,
        monthly_budget: f64,
    ) -> Result<PaceAnalysis, String> {
        let summary = self.summary(state).await?;
        let now = Utc::now();
        let days_in_month = days_in_month(now.year(), now.month()) as f64;
        let elapsed_days = now.day() as f64;

        let projected = if elapsed_days > 0.0 {
            summary.total_monthly / elapsed_days * days_in_month
        } else {
            summary.total_monthly
        };

        Ok(PaceAnalysis {
            monthly_budget,
            spent_so_far: summary.total_monthly,
            projected_monthly_total: projected,
            on_track: projected <= monthly_budget,
        })
    }

    fn codex_monthly_cost(&self) -> Option<f64> {
        if let Ok(cache) = CODEX_COST_CACHE.lock() {
            if let Some(cached) = cache.as_ref() {
                if cached.computed_at.elapsed() < Duration::from_secs(30 * 60) {
                    return Some(cached.total_cost);
                }
            }
        }

        let scanned = self.scan_codex_sessions_last_30_days().ok()?;
        if let Ok(mut cache) = CODEX_COST_CACHE.lock() {
            *cache = Some(CachedCodexCost {
                computed_at: Instant::now(),
                total_cost: scanned,
            });
        }
        Some(scanned)
    }

    fn scan_codex_sessions_last_30_days(&self) -> Result<f64, String> {
        let home = home_dir()
            .ok_or_else(|| "failed to resolve home directory (USERPROFILE/HOME)".to_string())?;
        let roots = [
            home.join(".codex").join("sessions"),
            home.join(".codex").join("archived_sessions"),
        ];

        let now = Utc::now();
        let mut totals_by_model: BTreeMap<String, TokenTotals> = BTreeMap::new();

        for root in roots {
            if !root.exists() {
                continue;
            }
            let files = collect_jsonl_files(root.as_path())?;
            for file in files {
                let modified = fs::metadata(&file)
                    .and_then(|meta| meta.modified())
                    .unwrap_or(SystemTime::UNIX_EPOCH);
                let modified_at: DateTime<Utc> = DateTime::<Utc>::from(modified);
                if now.signed_duration_since(modified_at).num_days() > 30 {
                    continue;
                }

                let content = fs::read_to_string(&file).map_err(|error| {
                    format!("failed to read codex session {}: {error}", file.display())
                })?;

                for line in content.lines() {
                    let value: Value = match serde_json::from_str(line) {
                        Ok(value) => value,
                        Err(_) => continue,
                    };
                    if value.get("type").and_then(Value::as_str) != Some("event_msg") {
                        continue;
                    }
                    if value.pointer("/payload/type").and_then(Value::as_str) != Some("token_count")
                    {
                        continue;
                    }

                    let model = value
                        .pointer("/payload/model")
                        .and_then(Value::as_str)
                        .or_else(|| {
                            value
                                .pointer("/payload/last_token_usage/model")
                                .and_then(Value::as_str)
                        })
                        .unwrap_or("gpt-4o")
                        .to_string();

                    let input = value
                        .pointer("/payload/last_token_usage/input_tokens")
                        .and_then(Value::as_u64)
                        .unwrap_or(0);
                    let output = value
                        .pointer("/payload/last_token_usage/output_tokens")
                        .and_then(Value::as_u64)
                        .unwrap_or(0);
                    let reasoning = value
                        .pointer("/payload/last_token_usage/reasoning_output_tokens")
                        .and_then(Value::as_u64)
                        .unwrap_or(0);

                    let totals = totals_by_model.entry(model).or_default();
                    totals.input += input;
                    totals.output += output;
                    totals.reasoning_output += reasoning;
                }
            }
        }

        Ok(calculate_cost_from_totals(&totals_by_model))
    }
}

fn collect_jsonl_files(root: &Path) -> Result<Vec<PathBuf>, String> {
    let mut stack = vec![root.to_path_buf()];
    let mut files = Vec::new();

    while let Some(current) = stack.pop() {
        let entries = fs::read_dir(&current)
            .map_err(|error| format!("failed to read directory {}: {error}", current.display()))?;

        for entry in entries.flatten() {
            let path = entry.path();
            if path.is_dir() {
                stack.push(path);
            } else if path.extension().and_then(|ext| ext.to_str()) == Some("jsonl") {
                files.push(path);
            }
        }
    }

    Ok(files)
}

fn pricing_for_model(model: &str) -> (f64, f64, f64) {
    let model = model.to_lowercase();
    if model.starts_with("o1") || model.starts_with("o3") {
        (2.50, 10.00, 10.00)
    } else if model.starts_with("gpt-4o-mini") {
        (0.15, 0.60, 0.60)
    } else if model.starts_with("gpt-4o") {
        (2.50, 10.00, 10.00)
    } else if model.starts_with("gpt-4.1-mini") {
        (0.40, 1.60, 1.60)
    } else if model.starts_with("gpt-4.1") {
        (2.00, 8.00, 8.00)
    } else if model.starts_with("claude-sonnet-4") {
        (3.00, 15.00, 15.00)
    } else {
        (5.00, 15.00, 15.00)
    }
}

fn calculate_cost_from_totals(totals_by_model: &BTreeMap<String, TokenTotals>) -> f64 {
    totals_by_model
        .iter()
        .map(|(model, totals)| {
            let (input_price, output_price, reasoning_price) = pricing_for_model(model);
            (totals.input as f64 / 1_000_000.0) * input_price
                + (totals.output as f64 / 1_000_000.0) * output_price
                + (totals.reasoning_output as f64 / 1_000_000.0) * reasoning_price
        })
        .sum::<f64>()
}

fn trim_history(mut history: Vec<MonthlyCostHistory>) -> Vec<MonthlyCostHistory> {
    let now = Utc::now().date_naive();
    let earliest = now - chrono::Duration::days(370);
    history.retain(|entry| {
        NaiveDate::parse_from_str(&format!("{}-01", entry.month), "%Y-%m-%d")
            .map(|month| month >= earliest)
            .unwrap_or(false)
    });
    history.sort_by(|a, b| a.month.cmp(&b.month));
    if history.len() > 12 {
        let keep_from = history.len() - 12;
        history.split_off(keep_from)
    } else {
        history
    }
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if (year % 4 == 0 && year % 100 != 0) || year % 400 == 0 {
                29
            } else {
                28
            }
        }
        _ => 30,
    }
}

#[tauri::command]
#[instrument(skip(state, app))]
pub async fn get_cost_summary(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<CostSummary, String> {
    let engine = CostEngine;
    let summary = engine.summary(&state).await?;
    let _ = engine.persist_month(&app, &summary);
    Ok(summary)
}

#[tauri::command]
#[instrument(skip(app))]
pub fn get_cost_history(app: tauri::AppHandle) -> Result<Vec<MonthlyCostHistory>, String> {
    CostEngine.load_history(&app)
}

#[tauri::command]
#[instrument(skip(state))]
pub async fn get_roi_analysis(state: tauri::State<'_, AppState>) -> Result<RoiAnalysis, String> {
    CostEngine.roi_analysis(&state).await
}

#[tauri::command]
#[instrument(skip(state))]
pub async fn get_pace_analysis(
    state: tauri::State<'_, AppState>,
    monthly_budget: Option<f64>,
) -> Result<PaceAnalysis, String> {
    CostEngine
        .pace_analysis(&state, monthly_budget.unwrap_or(100.0))
        .await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_is_capped_to_twelve() {
        let mut items = Vec::new();
        for i in 0..20 {
            items.push(MonthlyCostHistory {
                month: format!("2025-{:02}", (i % 12) + 1),
                total: i as f64,
                by_provider: Vec::new(),
            });
        }
        let trimmed = trim_history(items);
        assert!(trimmed.len() <= 12);
    }

    #[test]
    fn pricing_table_matches_expected_tiers() {
        assert_eq!(pricing_for_model("o3"), (2.50, 10.00, 10.00));
        assert_eq!(pricing_for_model("gpt-4o-mini"), (0.15, 0.60, 0.60));
        assert_eq!(pricing_for_model("gpt-4o"), (2.50, 10.00, 10.00));
        assert_eq!(pricing_for_model("gpt-4.1-mini"), (0.40, 1.60, 1.60));
        assert_eq!(pricing_for_model("gpt-4.1"), (2.00, 8.00, 8.00));
        assert_eq!(pricing_for_model("claude-sonnet-4"), (3.00, 15.00, 15.00));
        assert_eq!(pricing_for_model("unknown-model"), (5.00, 15.00, 15.00));
    }

    #[test]
    fn calculates_cost_from_totals() {
        let mut totals = BTreeMap::new();
        totals.insert(
            "gpt-4o-mini".to_string(),
            TokenTotals {
                input: 1_000_000,
                output: 1_000_000,
                reasoning_output: 1_000_000,
            },
        );
        let cost = calculate_cost_from_totals(&totals);
        assert!((cost - 1.35).abs() < 0.001);
    }
}
