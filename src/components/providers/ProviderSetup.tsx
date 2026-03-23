import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type {
  AuthMethod,
  AuthSourceMode,
  CopilotDeviceFlowStart,
  ProviderInfo,
} from "@/hooks/useProvider";
import { useProvider } from "@/hooks/useProvider";

interface ProviderSetupProps {
  open: boolean;
  providerId: string | null;
  authMethod: AuthMethod;
  providerInfo?: ProviderInfo | null;
  onClose: () => void;
  onSaved: () => void;
}

export const ProviderSetup = ({
  open,
  providerId,
  authMethod,
  providerInfo: providerInfoProp,
  onClose,
  onSaved,
}: ProviderSetupProps) => {
  const { t } = useTranslation();
  const providerApi = useProvider();
  const [credential, setCredential] = useState("");
  const [jetbrainsPath, setJetbrainsPath] = useState("");
  const [health, setHealth] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copilotFlow, setCopilotFlow] = useState<CopilotDeviceFlowStart | null>(null);
  const [copilotFlowStatus, setCopilotFlowStatus] = useState<string>("");
  const [copilotPollIntervalSec, setCopilotPollIntervalSec] = useState(5);
  const [copilotBusy, setCopilotBusy] = useState(false);
  const [providerInfo, setProviderInfo] = useState<ProviderInfo | null>(providerInfoProp ?? null);
  const [selectedMode, setSelectedMode] = useState<AuthSourceMode>("auto");
  const previousProviderIdRef = useRef<string | null>(providerId);

  const setupGuidance = useMemo(() => {
    switch (providerId) {
      case "codex":
        return t("provider.setup.guide.codex");
      case "claude":
        return t("provider.setup.guide.claude");
      case "gemini":
        return t("provider.setup.guide.gemini");
      case "kiro":
        return t("provider.setup.guide.kiro");
      case "copilot":
        return t("provider.setup.guide.copilot");
      case "cursor":
        return t("provider.setup.guide.cursor");
      case "jetbrains":
        return t("provider.setup.guide.jetbrains");
      default:
        return t("provider.setup.guide.default");
    }
  }, [providerId, t]);

  const requiresCredentialInput = useMemo(
    () => ["api_key", "oauth_token", "token"].includes(selectedMode),
    [selectedMode],
  );
  const allowEmptyCredential = !requiresCredentialInput;
  const isCopilotProvider = providerId === "copilot";
  const isJetBrainsProvider = providerId === "jetbrains";
  const safeCopilotVerificationUrl = useMemo(() => {
    if (!copilotFlow) return null;
    const candidate = copilotFlow.verification_uri_complete || copilotFlow.verification_uri;
    if (!candidate) return null;
    try {
      const parsed = new URL(candidate);
      const host = parsed.hostname.toLowerCase();
      if (
        parsed.protocol !== "https:" ||
        (host !== "github.com" && host !== "www.github.com")
      ) {
        return null;
      }
      return parsed.toString();
    } catch {
      return null;
    }
  }, [copilotFlow]);

  const resetFormState = useCallback(() => {
    setCredential("");
    setJetbrainsPath("");
    setHealth("");
    setCopilotFlow(null);
    setCopilotFlowStatus("");
    setCopilotPollIntervalSec(5);
    setProviderInfo(providerInfoProp ?? null);
    setSelectedMode("auto");
  }, [providerInfoProp]);

  useEffect(() => {
    const providerChanged = previousProviderIdRef.current !== providerId;
    previousProviderIdRef.current = providerId;

    if (!open || providerChanged) {
      resetFormState();
    }
  }, [open, providerId, resetFormState]);

  useEffect(() => {
    if (!open || !providerId) return;
    let disposed = false;

    void Promise.all([
      providerInfoProp
        ? Promise.resolve(providerInfoProp)
        : providerApi.getProviderInfo(providerId),
      providerApi.getProviderAuthModes(),
    ]).then(([info, modeMap]) => {
      if (disposed) return;
      setProviderInfo(info);
      setSelectedMode(modeMap[providerId] ?? info.default_auth_mode);
    });

    return () => {
      disposed = true;
    };
  }, [open, providerApi, providerId, providerInfoProp]);

  const label = useMemo(() => {
    if (selectedMode === "none" || selectedMode === "auto" || selectedMode === "cli") {
      return t("provider.setup.label.none");
    }
    if (selectedMode === "oauth_token") return t("provider.setup.label.oauthToken");
    if (selectedMode === "token") return t("provider.setup.label.accessToken");
    if (selectedMode === "api_key") return t("provider.setup.label.apiKey");
    if (providerId === "cursor") return t("provider.setup.label.cookieHeader");
    if (providerId === "jetbrains") return t("provider.setup.label.jetbrainsPath");
    if (authMethod === "none") return t("provider.setup.label.none");
    if (authMethod === "oauth") return t("provider.setup.label.oauthToken");
    if (authMethod === "token") return t("provider.setup.label.accessToken");
    return t("provider.setup.label.apiKey");
  }, [authMethod, providerId, selectedMode, t]);

  const supportedAuthModes = useMemo<AuthSourceMode[]>(() => {
    if (providerInfo?.supported_auth_modes?.length) {
      return providerInfo.supported_auth_modes;
    }
    return ["auto"];
  }, [providerInfo]);

  const modeLabel = useCallback(
    (mode: AuthSourceMode): string => {
      switch (mode) {
        case "auto":
          return t("provider.setup.mode.auto");
        case "api_key":
          return t("provider.setup.mode.api_key");
        case "oauth_token":
          return t("provider.setup.mode.oauth_token");
        case "token":
          return t("provider.setup.mode.token");
        case "cli":
          return t("provider.setup.mode.cli");
        case "none":
          return t("provider.setup.mode.none");
        default:
          return mode;
      }
    },
    [t],
  );

  const runHealthCheck = useCallback(async () => {
    if (!providerId) return;
    await providerApi.setProviderAuthMode(providerId, selectedMode);
    const status = await providerApi.checkHealth(providerId);
    setHealth(
      status.configured && status.reachable
        ? t("provider.setup.health.connected")
        : status.configured
          ? t("provider.setup.health.configuredUnreachable")
          : t("provider.setup.health.notConfigured"),
    );
  }, [providerApi, providerId, selectedMode, t]);

  const pollCopilotLogin = useCallback(async () => {
    if (!copilotFlow) return;
    setCopilotBusy(true);
    try {
      const result = await providerApi.pollCopilotDeviceFlow(copilotFlow.device_code);
      setCopilotFlowStatus(result.status);
      if (result.interval && result.interval > 0) {
        setCopilotPollIntervalSec(result.interval);
      }

      if (result.status === "authorized") {
        setHealth(t("provider.setup.health.connected"));
        await runHealthCheck();
        onSaved();
      } else if (result.message) {
        setHealth(result.message);
      }
    } finally {
      setCopilotBusy(false);
    }
  }, [copilotFlow, onSaved, providerApi, runHealthCheck, t]);

  useEffect(() => {
    if (!isCopilotProvider || !copilotFlow) return;
    if (!["authorization_pending", "slow_down"].includes(copilotFlowStatus)) return;

    const timer = window.setTimeout(() => {
      void pollCopilotLogin();
    }, Math.max(3, copilotPollIntervalSec) * 1000);
    return () => window.clearTimeout(timer);
  }, [
    copilotFlow,
    copilotFlowStatus,
    copilotPollIntervalSec,
    isCopilotProvider,
    pollCopilotLogin,
  ]);

  const startCopilotLogin = useCallback(async () => {
    setCopilotBusy(true);
    try {
      const flow = await providerApi.startCopilotDeviceFlow();
      setCopilotFlow(flow);
      setCopilotFlowStatus("authorization_pending");
      setCopilotPollIntervalSec(flow.interval || 5);
      setHealth(t("provider.setup.health.openVerification"));
    } finally {
      setCopilotBusy(false);
    }
  }, [providerApi, t]);

  const save = async () => {
    if (!providerId) return;
    await providerApi.setProviderAuthMode(providerId, selectedMode);

    if (isJetBrainsProvider) {
      setLoading(true);
      try {
        if (requiresCredentialInput && jetbrainsPath.trim()) {
          await providerApi.saveCredential(providerId, jetbrainsPath.trim(), selectedMode);
        } else {
          await providerApi.deleteCredential(providerId, selectedMode);
        }
        await runHealthCheck();
        onSaved();
      } finally {
        setLoading(false);
      }
      return;
    }

    if (allowEmptyCredential) {
      await providerApi.deleteCredential(providerId, selectedMode);
      await runHealthCheck();
      onSaved();
      return;
    }

    if (isCopilotProvider && selectedMode === "oauth_token" && !credential.trim()) {
      await runHealthCheck();
      onSaved();
      return;
    }

    setLoading(true);
    try {
      await providerApi.saveCredential(providerId, credential, selectedMode);
      await runHealthCheck();
      setCredential("");
      onSaved();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="border-border/70 bg-[var(--glass-bg)] shadow-[var(--shadow-hard)]">
        <DialogHeader>
          <DialogTitle>{t("provider.setup.title")}</DialogTitle>
          <DialogDescription>
            {t("provider.setup.description", {
              provider: providerId || t("provider.common.provider"),
            })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="provider-auth-mode">
            {t("provider.setup.mode.label")}
          </label>
          <select
            id="provider-auth-mode"
            className="ui-field w-full px-3 py-2 text-sm"
            value={selectedMode}
            onChange={(event) => setSelectedMode(event.currentTarget.value as AuthSourceMode)}
          >
            {supportedAuthModes.map((mode) => (
              <option key={mode} value={mode}>
                {modeLabel(mode)}
              </option>
            ))}
          </select>

          <label className="text-sm font-medium" htmlFor="provider-credential">
            {label}
          </label>
          {allowEmptyCredential && !isJetBrainsProvider ? (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              {selectedMode === "auto"
                ? t("provider.setup.localSource")
                : selectedMode === "cli"
                  ? t("provider.setup.cliSource")
                  : t("provider.setup.noneSource")}
            </div>
          ) : (
            <input
              id="provider-credential"
              className="ui-field w-full px-3 py-2 text-sm"
              type={isJetBrainsProvider ? "text" : "password"}
              value={isJetBrainsProvider ? jetbrainsPath : credential}
              onChange={(event) =>
                isJetBrainsProvider
                  ? setJetbrainsPath(event.currentTarget.value)
                  : setCredential(event.currentTarget.value)
              }
              placeholder={t("provider.setup.placeholder", { label })}
            />
          )}

          {isCopilotProvider && selectedMode === "oauth_token" ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
              <p className="text-muted-foreground">
                {t("provider.setup.copilot.recommended")}
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={startCopilotLogin}
                  disabled={copilotBusy || loading}
                >
                  {t("provider.setup.copilot.signIn")}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={pollCopilotLogin}
                  disabled={!copilotFlow || copilotBusy || loading}
                >
                  {t("provider.setup.copilot.checkStatus")}
                </Button>
              </div>
              {copilotFlow ? (
                <div className="space-y-1">
                  <p>
                    {t("provider.setup.copilot.code")}: <strong>{copilotFlow.user_code}</strong>
                  </p>
                  <a
                    className="underline"
                    href={safeCopilotVerificationUrl ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(event) => {
                      if (!safeCopilotVerificationUrl) {
                        event.preventDefault();
                      }
                    }}
                  >
                    {safeCopilotVerificationUrl ??
                      t("provider.setup.copilot.invalidVerificationUrl")}
                  </a>
                  {copilotFlowStatus ? (
                    <p className="text-muted-foreground">
                      {t("provider.setup.copilot.loginStatus", { status: copilotFlowStatus })}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">{setupGuidance}</p>
          {health ? (
            <p className="text-xs text-muted-foreground">
              {t("provider.setup.status")}: {health}
            </p>
          ) : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={runHealthCheck}>
            {t("provider.setup.testConnection")}
          </Button>
          <Button
            disabled={
              loading ||
              (copilotBusy && !allowEmptyCredential) ||
              (!allowEmptyCredential &&
                !isJetBrainsProvider &&
                !credential &&
                !(isCopilotProvider && selectedMode === "oauth_token"))
            }
            onClick={save}
          >
            {t("provider.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
