const commonRequired = [
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  "UPDATER_PUBLIC_KEY",
];

const platform = (process.env.RELEASE_OS ?? "").trim().toLowerCase();

const platformRequired = {
  "macos-latest": [
    "APPLE_CERTIFICATE",
    "APPLE_CERTIFICATE_PASSWORD",
    "APPLE_ID",
    "APPLE_PASSWORD",
    "APPLE_TEAM_ID",
    "APPLE_SIGNING_IDENTITY",
    "KEYCHAIN_PASSWORD",
  ],
};

const windowsSigningConfigured = [
  "WINDOWS_CERTIFICATE",
  "WINDOWS_CERTIFICATE_PASSWORD",
  "WINDOWS_CERTIFICATE_SHA1",
  "WINDOWS_DIGEST_ALGORITHM",
  "WINDOWS_TIMESTAMP_URL",
].every((name) => (process.env[name] ?? "").toString().trim());

const required = [...commonRequired];

if (platform === "windows-latest") {
  if (windowsSigningConfigured) {
    required.push(
      "WINDOWS_CERTIFICATE",
      "WINDOWS_CERTIFICATE_PASSWORD",
      "WINDOWS_CERTIFICATE_SHA1",
      "WINDOWS_DIGEST_ALGORITHM",
      "WINDOWS_TIMESTAMP_URL",
    );
  } else {
    console.log(
      "Windows signing secrets are not fully configured; continuing with unsigned Windows release artifact.",
    );
  }
} else {
  required.push(...(platformRequired[platform] ?? []));
}

const missing = required.filter((name) => !(process.env[name] ?? "").toString().trim());

if (missing.length > 0) {
  throw new Error(
    `Missing required ${platform || "release"} secrets: ${missing.join(", ")}`,
  );
}

console.log(
  `Release secrets OK for ${platform || "generic release"}: ${required.length} values configured`,
);
