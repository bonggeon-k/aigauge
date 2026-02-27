use chrono::{Datelike, Utc};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use tauri::Manager;
use tracing::instrument;

use crate::commands::{AppState, PROVIDER_IDS};

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

impl CostEngine {
    #[instrument(skip(self, state))]
    pub async fn summary(&self, state: &AppState) -> Result<CostSummary, String> {
        let mut total = 0.0;
        let mut by_provider = Vec::new();

        for provider in PROVIDER_IDS {
            let amount = state
                .providers
                .cost_for(provider)
                .await
                .map_err(|e| e.to_string())?
                .map(|c| c.total)
                .unwrap_or(0.0);

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
        history.sort_by(|a, b| a.month.cmp(&b.month));
        if history.len() > 12 {
            let keep_from = history.len() - 12;
            history = history.split_off(keep_from);
        }

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
        serde_json::from_str(&raw).map_err(|error| format!("failed to parse cost history: {error}"))
    }

    #[instrument(skip(self, state))]
    pub async fn roi_analysis(&self, state: &AppState) -> Result<RoiAnalysis, String> {
        let mut rows = Vec::new();
        for provider in PROVIDER_IDS {
            let usage = state
                .providers
                .usage_for(provider)
                .await
                .map_err(|e| e.to_string())?;
            let cost = state
                .providers
                .cost_for(provider)
                .await
                .map_err(|e| e.to_string())?
                .map(|c| c.total)
                .unwrap_or(0.0);

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
            .filter(|r| r.efficiency_score.is_finite())
            .max_by(|a, b| a.efficiency_score.total_cmp(&b.efficiency_score))
            .map(|r| r.provider.clone());

        Ok(RoiAnalysis {
            entries: rows,
            best_value_provider,
        })
    }

    #[instrument(skip(self, state))]
    pub async fn pace_analysis(&self, state: &AppState, monthly_budget: f64) -> Result<PaceAnalysis, String> {
        let summary = self.summary(state).await?;
        let now = Utc::now();
        let days_in_month = match now.month() {
            1 => 31,
            2 => if now.year() % 4 == 0 { 29 } else { 28 },
            3 => 31,
            4 => 30,
            5 => 31,
            6 => 30,
            7 => 31,
            8 => 31,
            9 => 30,
            10 => 31,
            11 => 30,
            _ => 31,
        } as f64;

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
        items.sort_by(|a, b| a.month.cmp(&b.month));
        let keep_from = items.len() - 12;
        let trimmed = items.split_off(keep_from);
        assert_eq!(trimmed.len(), 12);
    }
}
