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
    shell: false,
    env: {
      ...process.env,
      ...(options.env ?? {}),
    },
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
};

run("[1/9] Git status", "git", ["status", "--short"]);
run("[2/9] Version alignment", "node", ["./scripts/check-version-alignment.mjs"], {
  env: { RELEASE_TAG: releaseTag },
});
run("[3/9] Provider env doctor", "pnpm", ["doctor:providers"]);
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
run("[6/9] Frontend lint", "pnpm", ["lint"]);
run("[7/9] Frontend build", "pnpm", ["build"]);
run("[8/9] Cargo audit", "cargo", ["audit"], { cwd: path.join(root, "src-tauri") });
run("[9/9] pnpm audit", "pnpm", ["audit", "--audit-level=high"]);

const gitleaks = spawnSync("gitleaks", ["version"], {
  cwd: root,
  stdio: "ignore",
  shell: false,
  env: process.env,
});
if (gitleaks.status === 0) {
  run("[extra] gitleaks secret scan", "gitleaks", [
    "detect",
    "--source",
    ".",
    "--redact",
  ]);
} else {
  console.log("[extra] gitleaks not installed (skip)");
}

console.log("");
console.log("Release readiness checks completed.");
console.log("For public release also verify:");
console.log("- docs/OPEN_SOURCE_RELEASE_CHECKLIST.md");
console.log("- docs/PROVENANCE.md");
console.log("- THIRD_PARTY_NOTICES.md");
