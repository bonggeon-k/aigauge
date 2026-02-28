use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Component, Path, PathBuf};
use tauri::Manager;
use tracing::instrument;

use crate::commands::{resolve_dashboard_entry, AppState, TrackKind, PROVIDER_IDS};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ExportFormat {
    Csv,
    Json,
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
    pub track_id: Option<String>,
    pub track_kind: Option<String>,
    pub track_label: Option<String>,
    pub track_used: Option<u64>,
    pub track_limit: Option<u64>,
    pub track_unit: Option<String>,
    pub track_reset_at: Option<String>,
    pub requests: u64,
    pub tokens: u64,
    pub period_start: String,
    pub period_end: String,
    pub stale: bool,
    pub cost: Option<f64>,
}

#[instrument(skip(state, app, request))]
async fn collect_rows(
    state: &AppState,
    app: &tauri::AppHandle,
    request: &ExportRequest,
) -> Result<Vec<ExportRow>, String> {
    let providers = request
        .providers
        .clone()
        .unwrap_or_else(|| PROVIDER_IDS.iter().map(|p| p.to_string()).collect());

    let mut rows = Vec::new();
    for provider in providers {
        let (entry, _) = resolve_dashboard_entry(provider.as_str(), state, app)
            .await
            .map_err(|e| e.to_string())?;
        if entry.tracks.is_empty() {
            rows.push(ExportRow {
                provider,
                track_id: None,
                track_kind: None,
                track_label: None,
                track_used: None,
                track_limit: None,
                track_unit: None,
                track_reset_at: None,
                requests: entry.usage.requests,
                tokens: entry.usage.tokens,
                period_start: entry.usage.period_start,
                period_end: entry.usage.period_end,
                stale: entry.stale,
                cost: if request.include_cost {
                    entry
                        .cost_view
                        .total
                        .or(entry.cost.map(|value| value.total))
                } else {
                    None
                },
            });
            continue;
        }

        for track in entry.tracks {
            let cost = if request.include_cost
                && matches!(
                    (entry.preferred_track, track.kind),
                    (TrackKind::Subscription, TrackKind::Subscription)
                        | (TrackKind::Api, TrackKind::Api)
                        | (TrackKind::Manual, TrackKind::Manual)
                ) {
                entry
                    .cost_view
                    .total
                    .or(entry.cost.as_ref().map(|value| value.total))
            } else {
                None
            };

            rows.push(ExportRow {
                provider: provider.clone(),
                track_id: Some(track.id.clone()),
                track_kind: Some(
                    match track.kind {
                        TrackKind::Subscription => "subscription",
                        TrackKind::Api => "api",
                        TrackKind::Manual => "manual",
                    }
                    .to_string(),
                ),
                track_label: Some(track.label.clone()),
                track_used: Some(track.used),
                track_limit: Some(track.limit),
                track_unit: Some(track.unit.clone()),
                track_reset_at: Some(track.reset_at.clone()),
                requests: entry.usage.requests,
                tokens: entry.usage.tokens,
                period_start: entry.usage.period_start.clone(),
                period_end: entry.usage.period_end.clone(),
                stale: entry.stale,
                cost,
            });
        }
    }

    Ok(rows)
}

fn rows_to_csv(rows: &[ExportRow], include_cost: bool) -> String {
    let mut out = String::from(
        "provider,track_id,track_kind,track_label,track_used,track_limit,track_unit,track_reset_at,requests,tokens,period_start,period_end,stale",
    );
    if include_cost {
        out.push_str(",cost");
    }
    out.push('\n');

    for row in rows {
        let line = if include_cost {
            format!(
                "{},{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
                row.provider,
                row.track_id.clone().unwrap_or_default(),
                row.track_kind.clone().unwrap_or_default(),
                row.track_label.clone().unwrap_or_default(),
                row.track_used.unwrap_or(0),
                row.track_limit.unwrap_or(0),
                row.track_unit.clone().unwrap_or_default(),
                row.track_reset_at.clone().unwrap_or_default(),
                row.requests,
                row.tokens,
                row.period_start,
                row.period_end,
                row.stale,
                row.cost.unwrap_or(0.0)
            )
        } else {
            format!(
                "{},{},{},{},{},{},{},{},{},{},{},{},{}\n",
                row.provider,
                row.track_id.clone().unwrap_or_default(),
                row.track_kind.clone().unwrap_or_default(),
                row.track_label.clone().unwrap_or_default(),
                row.track_used.unwrap_or(0),
                row.track_limit.unwrap_or(0),
                row.track_unit.clone().unwrap_or_default(),
                row.track_reset_at.clone().unwrap_or_default(),
                row.requests,
                row.tokens,
                row.period_start,
                row.period_end,
                row.stale
            )
        };
        out.push_str(&line);
    }

    out
}

#[instrument(skip(state, app, request))]
async fn render_export_content(
    state: &AppState,
    app: &tauri::AppHandle,
    request: &ExportRequest,
) -> Result<String, String> {
    let rows = collect_rows(state, app, request).await?;
    match request.format {
        ExportFormat::Csv => Ok(rows_to_csv(&rows, request.include_cost)),
        ExportFormat::Json => {
            serde_json::to_string_pretty(&serde_json::json!({
                "schema_version": 2,
                "generated_at": Utc::now().to_rfc3339(),
                "format": request.format,
                "rows": rows,
                "date_range": request.date_range,
            }))
            .map_err(|error| format!("failed to serialize export json: {error}"))
        }
    }
}

fn default_export_path(app: &tauri::AppHandle, format: &ExportFormat) -> Result<PathBuf, String> {
    let base = app
        .path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?
        .join("exports");
    let extension = match format {
        ExportFormat::Csv => "csv",
        ExportFormat::Json => "json",
    };
    let filename = format!(
        "aigauge-export-{}.{}",
        Utc::now().format("%Y%m%d-%H%M%S"),
        extension
    );
    Ok(base.join(filename))
}

#[tauri::command]
#[instrument(skip(state, app, request))]
pub async fn export_data(
    request: ExportRequest,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    render_export_content(&state, &app, &request).await
}

#[tauri::command]
#[instrument(skip(state, app, request))]
pub async fn export_to_file(
    request: ExportRequest,
    path: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> Result<String, String> {
    let target = if path.trim().is_empty() {
        default_export_path(&app, &request.format)?
    } else {
        let parsed = Path::new(path.as_str());
        if parsed
            .components()
            .any(|component| matches!(component, Component::ParentDir))
        {
            return Err("invalid export path".to_string());
        }
        if parsed.is_absolute() {
            parsed.to_path_buf()
        } else {
            app.path()
                .app_data_dir()
                .map_err(|error| format!("failed to resolve app data dir: {error}"))?
                .join("exports")
                .join(parsed)
        }
    };
    let content = render_export_content(&state, &app, &request).await?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create export directory: {error}"))?;
    }
    fs::write(target.as_path(), content)
        .map_err(|error| format!("failed to write export file: {error}"))?;
    Ok(target.display().to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn csv_has_header_and_rows() {
        let rows = vec![ExportRow {
            provider: "codex".to_string(),
            track_id: Some("subscription:weekly".to_string()),
            track_kind: Some("subscription".to_string()),
            track_label: Some("Weekly".to_string()),
            track_used: Some(1),
            track_limit: Some(100),
            track_unit: Some("percent".to_string()),
            track_reset_at: Some("2026-02-28".to_string()),
            requests: 1,
            tokens: 2,
            period_start: "2026-02-01".to_string(),
            period_end: "2026-02-28".to_string(),
            stale: false,
            cost: Some(1.2),
        }];
        let csv = rows_to_csv(&rows, true);
        assert!(csv.contains("provider,track_id,track_kind"));
        assert!(csv.contains("codex,subscription:weekly,subscription,Weekly,1,100"));
    }
}
