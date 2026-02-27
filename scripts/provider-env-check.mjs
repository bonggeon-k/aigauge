#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const strict = process.argv.slice(2).includes("--strict");
const results = [];
const home = os.homedir();
const nowMs = Date.now();
const minValidMs = nowMs + 5 * 60 * 1000;

function pushResult(level, area, name, details, fix = "") {
  results.push({ level, area, name, details, fix });
}

function runCommand(command, args, timeoutMs = 5000) {
  const output = spawnSync(command, args, {
    timeout: timeoutMs,
    encoding: "utf8",
  });
  return {
    ok: output.status === 0,
    status: output.status,
    stdout: output.stdout ?? "",
    stderr: output.stderr ?? "",
    error: output.error ? String(output.error.message || output.error) : "",
  };
}

function hasCommand(command) {
  const resolver = process.platform === "win32" ? "where" : "which";
  const result = runCommand(resolver, [command]);
  return result.ok;
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return { exists: false };
  try {
    return { exists: true, value: JSON.parse(fs.readFileSync(filePath, "utf8")) };
  } catch (error) {
    return { exists: true, error: String(error.message || error) };
  }
}

function tokenPresent(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function stripAnsi(raw) {
  const withoutOsc = raw.replace(/\x1B\][^\x07]*(?:\x07|\x1B\\)/g, "");
  return withoutOsc.replace(/\x1B\[[0-?]*[ -/]*[@-~]/g, "");
}

async function fetchStatus(url, options = {}) {
  const { method = "GET", headers = {}, body = undefined, timeoutMs = 6000 } = options;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    return { ok: true, status: response.status };
  } catch (error) {
    return { ok: false, error: String(error.message || error) };
  } finally {
    clearTimeout(timeout);
  }
}

function checkBaseCommands() {
  for (const command of ["node", "pnpm", "cargo"]) {
    if (hasCommand(command)) {
      pushResult("pass", "base", command, "command available");
    } else {
      pushResult(
        "fail",
        "base",
        command,
        "command not found",
        "Install required toolchain before running AIGauge."
      );
    }
  }
}

function checkProviderCommands() {
  if (hasCommand("kiro-cli")) {
    pushResult("pass", "provider", "kiro-cli", "command available");
  } else {
    pushResult(
      "warn",
      "provider",
      "kiro-cli",
      "command not found",
      "Install/login Kiro CLI if you want Kiro quota tracking."
    );
  }

  if (hasCommand("gh")) {
    pushResult("pass", "provider", "gh", "command available");
  } else {
    pushResult(
      "warn",
      "provider",
      "gh",
      "command not found",
      "Install GitHub CLI for Copilot token auto-discovery."
    );
  }

  if (hasCommand("sqlite3")) {
    pushResult("pass", "provider", "sqlite3", "command available");
  } else {
    pushResult(
      "warn",
      "provider",
      "sqlite3",
      "command not found",
      "Install sqlite3 to enable Cursor browser-cookie fallback import."
    );
  }
}

function checkCodexCredential() {
  const filePath = path.join(home, ".codex", "auth.json");
  const data = readJson(filePath);
  if (!data.exists) {
    pushResult(
      "warn",
      "codex",
      "auth.json",
      `${filePath} not found`,
      "Run `codex` CLI login first."
    );
    return null;
  }
  if (data.error) {
    pushResult("fail", "codex", "auth.json", `invalid JSON: ${data.error}`);
    return null;
  }

  const auth = data.value;
  const apiKey = auth?.OPENAI_API_KEY;
  const token = auth?.tokens?.access_token;
  const refreshToken = auth?.tokens?.refresh_token;
  const accountId = auth?.tokens?.account_id;
  if (tokenPresent(apiKey) || tokenPresent(token)) {
    pushResult("pass", "codex", "auth.json", "token fields detected");
    return {
      authToken: tokenPresent(apiKey) ? apiKey : token,
      accountId: tokenPresent(accountId) ? accountId : undefined,
      hasRefreshToken: tokenPresent(refreshToken),
    };
  }

  pushResult(
    "warn",
    "codex",
    "auth.json",
    "no usable token field found",
    "Run `codex` CLI login again to refresh auth.json."
  );
  return null;
}

function checkClaudeCredential() {
  const filePath = path.join(home, ".claude", ".credentials.json");
  const data = readJson(filePath);
  if (!data.exists) {
    pushResult(
      "warn",
      "claude",
      "credentials",
      `${filePath} not found`,
      "Run `claude` CLI login first."
    );
    return null;
  }
  if (data.error) {
    pushResult("fail", "claude", "credentials", `invalid JSON: ${data.error}`);
    return null;
  }

  const oauth = data.value?.claudeAiOauth;
  const token = oauth?.accessToken;
  const expiresAt = Number(oauth?.expiresAt ?? 0);
  const scopes = Array.isArray(oauth?.scopes) ? oauth.scopes : [];
  if (!tokenPresent(token)) {
    pushResult(
      "warn",
      "claude",
      "credentials",
      "accessToken missing",
      "Run `claude` CLI login again."
    );
    return null;
  }

  if (!scopes.includes("user:profile")) {
    pushResult(
      "warn",
      "claude",
      "credentials",
      "required scope `user:profile` missing",
      "Re-authenticate Claude CLI with correct scope."
    );
  } else {
    pushResult("pass", "claude", "credentials", "scope `user:profile` present");
  }

  if (expiresAt > minValidMs) {
    pushResult("pass", "claude", "credentials", "token expiry is valid (>5 min)");
  } else {
    pushResult(
      "warn",
      "claude",
      "credentials",
      "token expired or expiring within 5 minutes",
      "Re-run `claude` login."
    );
  }

  return { authToken: token };
}

function checkGeminiCredential() {
  const filePath = path.join(home, ".gemini", "oauth_creds.json");
  const data = readJson(filePath);
  if (!data.exists) {
    pushResult(
      "warn",
      "gemini",
      "oauth_creds",
      `${filePath} not found`,
      "Run Gemini CLI login first."
    );
    return null;
  }
  if (data.error) {
    pushResult("fail", "gemini", "oauth_creds", `invalid JSON: ${data.error}`);
    return null;
  }

  const token = data.value?.access_token;
  const expiresAtSec = Number(data.value?.expires_at ?? 0);
  const expiresAtMs = expiresAtSec * 1000;
  if (!tokenPresent(token)) {
    pushResult(
      "warn",
      "gemini",
      "oauth_creds",
      "access_token missing",
      "Re-run Gemini login."
    );
    return null;
  }

  if (expiresAtMs > minValidMs) {
    pushResult("pass", "gemini", "oauth_creds", "token expiry is valid (>5 min)");
  } else {
    pushResult(
      "warn",
      "gemini",
      "oauth_creds",
      "token expired or expiring within 5 minutes",
      "Re-run Gemini login."
    );
  }

  return { authToken: token };
}

function checkGhAuth() {
  if (!hasCommand("gh")) return;
  const status = runCommand("gh", ["auth", "status", "-h", "github.com"], 6000);
  if (status.ok) {
    pushResult("pass", "copilot", "gh auth", "github.com auth is valid");
  } else {
    pushResult(
      "warn",
      "copilot",
      "gh auth",
      "github.com auth is invalid or missing",
      "Run `gh auth login -h github.com`."
    );
  }
}

function checkKiroUsageCli() {
  if (!hasCommand("kiro-cli")) return;
  const run = runCommand("kiro-cli", ["chat", "--no-interactive", "/usage"], 12000);
  const combined = `${run.stdout}\n${run.stderr}`;
  const cleaned = stripAnsi(combined);
  if (!run.ok) {
    pushResult(
      "warn",
      "kiro",
      "usage command",
      "kiro-cli command returned non-zero",
      "Ensure kiro-cli is installed and logged in."
    );
    return;
  }

  if (cleaned.includes("Estimated Usage")) {
    pushResult("pass", "kiro", "usage command", "estimated usage block detected");
  } else {
    pushResult(
      "warn",
      "kiro",
      "usage command",
      "output does not include `Estimated Usage`",
      "Check kiro-cli version/output format compatibility."
    );
  }
}

async function checkNetwork(codex, claude, gemini) {
  const checks = [];

  checks.push({
    area: "codex",
    name: "wham usage",
    run: async () => {
      const headers = { Accept: "application/json" };
      if (codex?.authToken) headers.Authorization = `Bearer ${codex.authToken}`;
      if (codex?.accountId) headers["ChatGPT-Account-Id"] = codex.accountId;
      const result = await fetchStatus("https://chatgpt.com/backend-api/wham/usage", { headers });
      if (!result.ok) return { level: "warn", details: result.error };
      if ([200, 401, 403].includes(result.status)) return { level: "pass", details: `HTTP ${result.status}` };
      return { level: "warn", details: `HTTP ${result.status}` };
    },
  });

  checks.push({
    area: "claude",
    name: "usage endpoint",
    run: async () => {
      const endpoints = ["https://api.claude.ai/api/usage", "https://claude.ai/api/usage"];
      const headers = { Accept: "application/json" };
      if (claude?.authToken) headers.Authorization = `Bearer ${claude.authToken}`;

      let lastError = "no endpoint attempted";
      for (const endpoint of endpoints) {
        const result = await fetchStatus(endpoint, { headers });
        if (!result.ok) {
          lastError = `${endpoint}: ${result.error}`;
          continue;
        }
        if ([200, 401, 403].includes(result.status)) {
          return { level: "pass", details: `${endpoint} -> HTTP ${result.status}` };
        }
        lastError = `${endpoint} -> HTTP ${result.status}`;
      }
      return { level: "warn", details: lastError };
    },
  });

  checks.push({
    area: "gemini",
    name: "quota endpoint",
    run: async () => {
      const headers = { "Content-Type": "application/json" };
      if (gemini?.authToken) headers.Authorization = `Bearer ${gemini.authToken}`;
      const result = await fetchStatus(
        "https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuota",
        { method: "POST", headers, body: "{}" }
      );
      if (!result.ok) return { level: "warn", details: result.error };
      if ([200, 401, 403, 404].includes(result.status)) return { level: "pass", details: `HTTP ${result.status}` };
      return { level: "warn", details: `HTTP ${result.status}` };
    },
  });

  const statusEndpoints = [
    ["service", "openai status", "https://status.openai.com/api/v1/summary"],
    ["service", "anthropic status", "https://status.anthropic.com/api/v2/status.json"],
    ["service", "google cloud status", "https://status.cloud.google.com/incidents.json"],
    ["service", "github status", "https://www.githubstatus.com/api/v2/status.json"],
    ["service", "cursor site", "https://www.cursor.com"],
    ["service", "jetbrains site", "https://www.jetbrains.com"],
    ["service", "kiro site", "https://kiro.dev"],
  ];

  for (const [area, name, url] of statusEndpoints) {
    checks.push({
      area,
      name,
      run: async () => {
        const result = await fetchStatus(url, { method: "HEAD" });
        if (!result.ok) return { level: "warn", details: result.error };
        if (result.status >= 200 && result.status < 400) return { level: "pass", details: `HTTP ${result.status}` };
        return { level: "warn", details: `HTTP ${result.status}` };
      },
    });
  }

  for (const check of checks) {
    const verdict = await check.run();
    pushResult(verdict.level, check.area, check.name, verdict.details);
  }
}

function printResults() {
  const icon = { pass: "PASS", warn: "WARN", fail: "FAIL" };
  for (const entry of results) {
    console.log(`[${icon[entry.level]}] ${entry.area}:${entry.name} - ${entry.details}`);
    if (entry.fix) {
      console.log(`       fix: ${entry.fix}`);
    }
  }
  const counts = results.reduce(
    (acc, entry) => {
      acc[entry.level] += 1;
      return acc;
    },
    { pass: 0, warn: 0, fail: 0 }
  );

  console.log("");
  console.log(
    `Summary: ${counts.pass} pass, ${counts.warn} warn, ${counts.fail} fail`
  );

  if (strict && (counts.fail > 0 || counts.warn > 0)) {
    process.exitCode = 1;
  } else if (counts.fail > 0) {
    process.exitCode = 1;
  }
}

async function main() {
  checkBaseCommands();
  checkProviderCommands();

  const codex = checkCodexCredential();
  const claude = checkClaudeCredential();
  const gemini = checkGeminiCredential();

  checkGhAuth();
  checkKiroUsageCli();
  await checkNetwork(codex, claude, gemini);
  printResults();
}

main().catch((error) => {
  console.error("[FAIL] doctor:unexpected -", String(error.message || error));
  process.exit(1);
});

