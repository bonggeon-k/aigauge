use chrono::Utc;
use serde::{Deserialize, Serialize};
use std::fs::{self, OpenOptions};
use std::path::{Path, PathBuf};
use tauri::Manager;
use tracing::instrument;

use crate::commands::{
    ensure_trusted_window, resolve_dashboard_entry, AppState, TrackKind, PROVIDER_IDS,
};

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

fn csv_escape(value: &str) -> String {
    if !value
        .chars()
        .any(|ch| matches!(ch, ',' | '"' | '\n' | '\r'))
    {
        return value.to_string();
    }

    format!("\"{}\"", value.replace('"', "\"\""))
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
        let mut fields = vec![
            csv_escape(row.provider.as_str()),
            csv_escape(row.track_id.as_deref().unwrap_or_default()),
            csv_escape(row.track_kind.as_deref().unwrap_or_default()),
            csv_escape(row.track_label.as_deref().unwrap_or_default()),
            row.track_used.unwrap_or(0).to_string(),
            row.track_limit.unwrap_or(0).to_string(),
            csv_escape(row.track_unit.as_deref().unwrap_or_default()),
            csv_escape(row.track_reset_at.as_deref().unwrap_or_default()),
            row.requests.to_string(),
            row.tokens.to_string(),
            csv_escape(row.period_start.as_str()),
            csv_escape(row.period_end.as_str()),
            row.stale.to_string(),
        ];

        if include_cost {
            fields.push(row.cost.unwrap_or(0.0).to_string());
        }

        out.push_str(fields.join(",").as_str());
        out.push('\n');
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
        ExportFormat::Json => serde_json::to_string_pretty(&serde_json::json!({
            "schema_version": 2,
            "generated_at": Utc::now().to_rfc3339(),
            "format": request.format,
            "rows": rows,
            "date_range": request.date_range,
        }))
        .map_err(|error| format!("failed to serialize export json: {error}")),
    }
}

fn default_export_path(app: &tauri::AppHandle, format: &ExportFormat) -> Result<PathBuf, String> {
    let base = export_root(app)?;
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

fn export_root(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .app_data_dir()
        .map_err(|error| format!("failed to resolve app data dir: {error}"))?
        .join("exports")
        .canonicalize()
        .or_else(|_| {
            let dir = app
                .path()
                .app_data_dir()
                .map_err(|error| format!("failed to resolve app data dir: {error}"))?
                .join("exports");
            fs::create_dir_all(&dir)
                .map_err(|error| format!("failed to create export root: {error}"))?;
            dir.canonicalize()
                .map_err(|error| format!("failed to resolve export root: {error}"))
        })
}

fn resolve_export_target(
    app: &tauri::AppHandle,
    format: &ExportFormat,
    path: &str,
) -> Result<PathBuf, String> {
    let root = export_root(app)?;
    let target = if path.trim().is_empty() {
        default_export_path(app, format)?
    } else {
        let parsed = Path::new(path.trim());
        if parsed.is_absolute() {
            return Err("absolute export paths are not allowed".to_string());
        }
        root.join(parsed)
    };

    let canonical_parent = target
        .parent()
        .ok_or_else(|| "invalid export path".to_string())?
        .canonicalize()
        .or_else(|_| {
            fs::create_dir_all(
                target
                    .parent()
                    .ok_or_else(|| "invalid export path".to_string())?,
            )
            .map_err(|error| format!("failed to create export directory: {error}"))?;
            target
                .parent()
                .ok_or_else(|| "invalid export path".to_string())?
                .canonicalize()
                .map_err(|error| format!("failed to resolve export directory: {error}"))
        })?;
    if !canonical_parent.starts_with(&root) {
        return Err("invalid export path".to_string());
    }
    Ok(target)
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
    window: tauri::Window,
) -> Result<String, String> {
    ensure_trusted_window(&window)?;
    let target = resolve_export_target(&app, &request.format, path.as_str())?;
    let content = render_export_content(&state, &app, &request).await?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("failed to create export directory: {error}"))?;
    }

    let mut file = OpenOptions::new()
        .create_new(true)
        .write(true)
        .open(&target)
        .map_err(|error| format!("failed to create export file: {error}"))?;
    use std::io::Write;
    file.write_all(content.as_bytes())
        .map_err(|error| format!("failed to write export file: {error}"))?;
    Ok(target.display().to_string())
}

#[tauri::command]
#[instrument(skip(app))]
pub fn open_exports_folder(app: tauri::AppHandle, window: tauri::Window) -> Result<String, String> {
    ensure_trusted_window(&window)?;
    let root = export_root(&app)?;
    open::that(root.as_path()).map_err(|error| format!("failed to open export folder: {error}"))?;
    Ok(root.display().to_string())
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

    #[test]
    fn csv_escapes_special_characters() {
        let rows = vec![ExportRow {
            provider: "co,dex".to_string(),
            track_id: Some("subscription:weekly".to_string()),
            track_kind: Some("subscription".to_string()),
            track_label: Some("weekly \"alpha\"\nline".to_string()),
            track_used: Some(1),
            track_limit: Some(100),
            track_unit: Some("percent".to_string()),
            track_reset_at: Some("2026-02-28".to_string()),
            requests: 1,
            tokens: 2,
            period_start: "2026-02-01".to_string(),
            period_end: "2026-02-28".to_string(),
            stale: false,
            cost: None,
        }];

        let csv = rows_to_csv(&rows, false);
        assert!(csv.contains("\"co,dex\""));
        assert!(csv.contains("\"weekly \"\"alpha\"\"\nline\""));
    }
}
