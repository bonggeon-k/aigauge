import fs from "node:fs";
import path from "node:path";

const pubkey = (process.env.UPDATER_PUBLIC_KEY ?? "").trim();
if (!pubkey || pubkey === "PLACEHOLDER") {
  throw new Error("UPDATER_PUBLIC_KEY secret is required for release builds");
}

const configPath = path.resolve("src-tauri/tauri.conf.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

if (!config.plugins) {
  config.plugins = {};
}
if (!config.plugins.updater) {
  config.plugins.updater = {};
}

config.plugins.updater.pubkey = pubkey;
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, "utf8");

console.log("Updater pubkey configured for this workflow run");
