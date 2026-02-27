use serde::Serialize;
use serde_json::Value;
use tracing::instrument;

use crate::commands::AppState;

#[derive(Debug, Clone, Serialize)]
pub struct ServiceStatus {
    pub provider_id: String,
    pub indicator: String,
    pub description: String,
}

fn parse_codex_status(value: &Value) -> ServiceStatus {
    let incidents = value
        .get("ongoing_incidents")
        .and_then(Value::as_array)
        .map(|items| items.len())
        .unwrap_or(0);
    if incidents > 0 {
        ServiceStatus {
            provider_id: "codex".to_string(),
            indicator: "major".to_string(),
            description: "OpenAI ongoing incidents".to_string(),
        }
    } else {
        ServiceStatus {
            provider_id: "codex".to_string(),
            indicator: "none".to_string(),
            description: "No incidents".to_string(),
        }
    }
}

fn parse_claude_status(value: &Value) -> ServiceStatus {
    let indicator = value
        .pointer("/status/indicator")
        .and_then(Value::as_str)
        .unwrap_or("unknown");
    ServiceStatus {
        provider_id: "claude".to_string(),
        indicator: indicator.to_string(),
        description: value
            .pointer("/status/description")
            .and_then(Value::as_str)
            .unwrap_or("Unknown")
            .to_string(),
    }
}

fn parse_gemini_status(value: &Value) -> ServiceStatus {
    let disruptions = value
        .as_array()
        .map(|items| {
            items
                .iter()
                .filter(|incident| {
                    incident
                        .get("status_impact")
                        .and_then(Value::as_str)
                        .map(|impact| impact != "SERVICE_OK")
                        .unwrap_or(true)
                })
                .count()
        })
        .unwrap_or(0);

    if disruptions > 0 {
        ServiceStatus {
            provider_id: "gemini".to_string(),
            indicator: "major".to_string(),
            description: "Google Cloud active disruptions".to_string(),
        }
    } else {
        ServiceStatus {
            provider_id: "gemini".to_string(),
            indicator: "none".to_string(),
            description: "No disruptions".to_string(),
        }
    }
}

fn unknown_status(provider_id: &str, description: &str) -> ServiceStatus {
    ServiceStatus {
        provider_id: provider_id.to_string(),
        indicator: "unknown".to_string(),
        description: description.to_string(),
    }
}

#[tauri::command]
#[instrument(skip(state))]
pub async fn get_service_statuses(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<ServiceStatus>, String> {
    let codex = match state
        .http_client
        .get("https://status.openai.com/api/v1/summary")
        .send()
        .await
    {
        Ok(response) => match response.json::<Value>().await {
            Ok(value) => parse_codex_status(&value),
            Err(_) => unknown_status("codex", "status endpoint unavailable"),
        },
        Err(_) => unknown_status("codex", "status endpoint unavailable"),
    };

    let claude = match state
        .http_client
        .get("https://status.anthropic.com/api/v2/status.json")
        .send()
        .await
    {
        Ok(response) => match response.json::<Value>().await {
            Ok(value) => parse_claude_status(&value),
            Err(_) => unknown_status("claude", "status endpoint unavailable"),
        },
        Err(_) => unknown_status("claude", "status endpoint unavailable"),
    };

    let gemini = match state
        .http_client
        .get("https://status.cloud.google.com/incidents.json")
        .send()
        .await
    {
        Ok(response) => match response.json::<Value>().await {
            Ok(value) => parse_gemini_status(&value),
            Err(_) => unknown_status("gemini", "status endpoint unavailable"),
        },
        Err(_) => unknown_status("gemini", "status endpoint unavailable"),
    };

    Ok(vec![codex, claude, gemini])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_status_payloads() {
        let codex = parse_codex_status(&serde_json::json!({"ongoing_incidents": []}));
        assert_eq!(codex.indicator, "none");

        let claude = parse_claude_status(
            &serde_json::json!({"status": {"indicator":"minor","description":"degraded"}}),
        );
        assert_eq!(claude.indicator, "minor");

        let gemini = parse_gemini_status(&serde_json::json!([]));
        assert_eq!(gemini.indicator, "none");
    }
}
