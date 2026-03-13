const required = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "UPDATER_PUBLIC_KEY",
];

const missing = required.filter(
  (name) => !(process.env[name] ?? "").toString().trim(),
);

if (missing.length > 0) {
  throw new Error(`Missing required release secrets: ${missing.join(", ")}`);
}

console.log(`Release secrets OK: ${required.length} values configured`);
