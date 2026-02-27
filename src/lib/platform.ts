export type PlatformName = "Windows" | "macOS" | "Linux" | "Desktop";

export const detectPlatform = (): PlatformName => {
  if (typeof navigator === "undefined") {
    return "Desktop";
  }

  const userAgent = navigator.userAgent.toLowerCase();
  if (userAgent.includes("windows")) {
    return "Windows";
  }
  if (userAgent.includes("mac")) {
    return "macOS";
  }
  if (userAgent.includes("linux")) {
    return "Linux";
  }
  return "Desktop";
};

export const platformDataKey = (platform: PlatformName): string => {
  if (platform === "Windows") return "windows";
  if (platform === "macOS") return "macos";
  if (platform === "Linux") return "linux";
  return "desktop";
};

export const applyPlatformDataAttribute = (platform: PlatformName): void => {
  if (typeof document === "undefined") {
    return;
  }
  document.documentElement.dataset.platform = platformDataKey(platform);
};

export const shortcutPrimaryModifier = (platform: PlatformName): string =>
  platform === "macOS" ? "Cmd" : "Ctrl";

export const formatShortcutAccelerator = (
  accelerator: string,
  platform: PlatformName,
): string => {
  const parts = accelerator.split("+");
  const transformed = parts.map((part) => {
    if (part === "CommandOrControl") {
      return shortcutPrimaryModifier(platform);
    }
    if (part === "Control") {
      return "Ctrl";
    }
    if (part === "Command") {
      return "Cmd";
    }
    if (part === "Option") {
      return platform === "macOS" ? "Option" : "Alt";
    }
    return part;
  });
  return transformed.join("+");
};
