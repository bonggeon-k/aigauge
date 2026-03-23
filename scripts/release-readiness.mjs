import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(".");
const packageJson = JSON.parse(
  fs.readFileSync(path.join(root, "package.json"), "utf8"),
);
const releaseTag = `v${String(packageJson.version ?? "").trim()}`;
const run = (label, command, args, options = {}) => {
  console.log(label);
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? root,
    stdio: "inherit",
    shell: options.shell ?? false,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

const runPnpm = (label, args) => {
  if (process.platform === "win32") {
    run(label, "pnpm", args, { shell: true });
    return;
  }
  run(label, "pnpm", args);
};

run("[1/9] Git status", "git", ["status", "--short"]);
run("[2/9] Version alignment", "node", ["./scripts/check-version-alignment.mjs"], {
  env: { RELEASE_TAG: releaseTag },
});
runPnpm("[3/9] Provider env doctor", ["doctor:providers"]);
run("[4/9] Rust clippy", "cargo", [
  "clippy",
  "--manifest-path",
  "src-tauri/Cargo.toml",
  "--all-targets",
  "--",
  "-D",
  "warnings",
]);
run("[5/9] Rust tests", "cargo", ["test", "--manifest-path", "src-tauri/Cargo.toml"]);
runPnpm("[6/9] Frontend lint", ["lint"]);
runPnpm("[7/9] Frontend build", ["build"]);
run("[8/9] Cargo audit", "cargo", ["audit"], { cwd: path.join(root, "src-tauri") });
runPnpm("[9/9] pnpm audit", ["audit", "--audit-level=high"]);

const gitleaks = spawnSync("gitleaks", ["version"], {
  cwd: root,
  stdio: "ignore",
  shell: false,
  env: process.env,
});
if (gitleaks.status === 0) {
  run("[extra] gitleaks working tree + git history scan", "gitleaks", [
    "detect",
    "--source",
    ".",
    "--redact",
    "--log-opts=--all",
  ]);
} else {
  console.log("[extra] gitleaks not installed (manual full-history secret scan required)");
}

console.log("");
console.log("Release readiness checks completed.");
console.log("For public release also verify:");
console.log("- docs/OPEN_SOURCE_RELEASE_CHECKLIST.md");
console.log("- docs/PROVENANCE.md");
console.log("- THIRD_PARTY_NOTICES.md");
