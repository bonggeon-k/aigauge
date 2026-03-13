import fs from "node:fs";
import path from "node:path";

const tag = process.env.RELEASE_TAG ?? "";
if (!tag.startsWith("v")) {
  throw new Error(`RELEASE_TAG must start with v, got: ${tag}`);
}

const packageJson = JSON.parse(
  fs.readFileSync(path.resolve("package.json"), "utf8"),
);
const cargoToml = fs.readFileSync(path.resolve("src-tauri/Cargo.toml"), "utf8");
const tauriConf = JSON.parse(
  fs.readFileSync(path.resolve("src-tauri/tauri.conf.json"), "utf8"),
);

const cargoVersionMatch = cargoToml.match(/^version\s*=\s*"([^"]+)"/m);
if (!cargoVersionMatch) {
  throw new Error("failed to parse version from src-tauri/Cargo.toml");
}

const packageVersion = String(packageJson.version ?? "").trim();
const cargoVersion = String(cargoVersionMatch[1] ?? "").trim();
const tauriVersion = String(tauriConf.version ?? "").trim();
const tagVersion = tag.slice(1);

if (!packageVersion || !cargoVersion || !tauriVersion) {
  throw new Error("one or more app versions are empty");
}

if (!(packageVersion === cargoVersion && cargoVersion === tauriVersion)) {
  throw new Error(
    `version mismatch: package=${packageVersion}, cargo=${cargoVersion}, tauri=${tauriVersion}`,
  );
}

if (tagVersion !== packageVersion) {
  throw new Error(`tag/version mismatch: tag=${tagVersion}, app=${packageVersion}`);
}

console.log(`Version alignment OK: ${tag} == ${packageVersion}`);
