import fs from "node:fs";
import path from "node:path";

const dir = path.resolve("src-tauri/capabilities");
if (!fs.existsSync(dir)) {
  throw new Error(`capabilities directory not found: ${dir}`);
}

const files = fs.readdirSync(dir).filter((name) => name.endsWith(".json"));
if (files.length === 0) {
  throw new Error("no capability files");
}

let totalPermissions = 0;
for (const file of files) {
  const raw = fs.readFileSync(path.join(dir, file), "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed.permissions)) {
    throw new Error(`${file}: no permissions array`);
  }
  totalPermissions += parsed.permissions.length;
}

console.log(`Capabilities OK: ${files.length} files, ${totalPermissions} permissions total`);
