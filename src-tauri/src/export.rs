use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use tracing::instrument;

use crate::commands::{AppState, PROVIDER_IDS};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
    Pdf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportDateRange {
    pub start: Option<String>,
    pub end: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportRequest {
    pub format: ExportFormat,
    pub date_range: Option<ExportDateRange>,
    pub providers: Option<Vec<String>>,
    pub include_cost: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExportRow {
    pub provider: String,
    pub requests: u64,
    pub tokens: u64,
    pub period_start: String,
    pub period_end: String,
    pub cost: Option<f64>,
}

#[instrument(skip(state, request))]
async fn collect_rows(state: &AppState, request: &ExportRequest) -> Result<Vec<ExportRow>, String> {
    let providers = request
        .providers
        .clone()
        .unwrap_or_else(|| PROVIDER_IDS.iter().map(|p| p.to_string()).collect());

    let mut rows = Vec::with_capacity(providers.len());
    for provider in providers {
        let usage = state
            .providers
            .usage_for(provider.as_str())
            .await
            .map_err(|e| e.to_string())?;
        let cost = if request.include_cost {
            state
                .providers
                .cost_for(provider.as_str())
                .await
                .map_err(|e| e.to_string())?
                .map(|c| c.total)
        } else {
            None
        };

        rows.push(ExportRow {
            provider,
            requests: usage.requests,
            tokens: usage.tokens,
            period_start: usage.period_start,
            period_end: usage.period_end,
            cost,
        });
    }

    Ok(rows)
}

fn rows_to_csv(rows: &[ExportRow], include_cost: bool) -> String {
    let mut out = String::from("provider,requests,tokens,period_start,period_end");
    if include_cost {
        out.push_str(",cost");
    }
    out.push('\n');

    for row in rows {
        let line = if include_cost {
            format!(
                "{},{},{},{},{},{}\n",
                row.provider,
                row.requests,
                row.tokens,
                row.period_start,
                row.period_end,
                row.cost.unwrap_or(0.0)
            )
        } else {
            format!(
                "{},{},{},{},{}\n",
                row.provider, row.requests, row.tokens, row.period_start, row.period_end
            )
        };
        out.push_str(&line);
    }

    out
}

#[tauri::command]
#[instrument(skip(state, request))]
pub async fn export_data(
    request: ExportRequest,
    state: tauri::State<'_, AppState>,
) -> Result<String, String> {
    let rows = collect_rows(&state, &request).await?;
    match request.format {
        ExportFormat::Csv => Ok(rows_to_csv(&rows, request.include_cost)),
        ExportFormat::Json | ExportFormat::Pdf => serde_json::to_string_pretty(&serde_json::json!({
            "generated_at": Utc::now().to_rfc3339(),
            "format": request.format,
            "rows": rows,
            "date_range": request.date_range,
        }))
        .map_err(|error| format!("failed to serialize export json: {error}")),
    }
}

#[tauri::command]
#[instrument(skip(state, request))]
pub async fn export_to_file(
    request: ExportRequest,
    path: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    let content = export_data(request, state).await?;
    fs::write(path, content).map_err(|error| format!("failed to write export file: {error}"))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_has_header_and_rows() {
        let rows = vec![ExportRow {
            provider: "codex".to_string(),
            requests: 1,
            tokens: 2,
            period_start: "2026-02-01".to_string(),
            period_end: "2026-02-28".to_string(),
            cost: Some(1.2),
        }];
        let csv = rows_to_csv(&rows, true);
        assert!(csv.contains("provider,requests,tokens,period_start,period_end,cost"));
        assert!(csv.contains("codex,1,2"));
    }
}
