import fs from "node:fs";
import path from "node:path";

const certificateThumbprint = (process.env.WINDOWS_CERTIFICATE_SHA1 ?? "").trim();
const digestAlgorithm = (process.env.WINDOWS_DIGEST_ALGORITHM ?? "").trim();
const timestampUrl = (process.env.WINDOWS_TIMESTAMP_URL ?? "").trim();

const missing = [
  ["WINDOWS_CERTIFICATE_SHA1", certificateThumbprint],
  ["WINDOWS_DIGEST_ALGORITHM", digestAlgorithm],
  ["WINDOWS_TIMESTAMP_URL", timestampUrl],
].filter(([, value]) => !value);

if (missing.length > 0) {
  throw new Error(
    `Missing Windows signing configuration: ${missing.map(([name]) => name).join(", ")}`,
  );
}

const configPath = path.resolve("src-tauri/tauri.conf.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

if (!config.bundle) {
  config.bundle = {};
}
if (!config.bundle.windows) {
  config.bundle.windows = {};
}

config.bundle.windows.certificateThumbprint = certificateThumbprint;
config.bundle.windows.digestAlgorithm = digestAlgorithm;
config.bundle.windows.timestampUrl = timestampUrl;

fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log("Windows signing configuration applied for this workflow run");
