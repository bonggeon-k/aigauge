import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AuthMethod, CopilotDeviceFlowStart } from "@/hooks/useProvider";
import { useProvider } from "@/hooks/useProvider";

interface ProviderSetupProps {
  open: boolean;
  providerId: string | null;
  authMethod: AuthMethod;
  onClose: () => void;
  onSaved: () => void;
}

export const ProviderSetup = ({
  open,
  providerId,
  authMethod,
  onClose,
  onSaved,
}: ProviderSetupProps) => {
  const providerApi = useProvider();
  const [credential, setCredential] = useState("");
  const [jetbrainsPath, setJetbrainsPath] = useState("");
  const [health, setHealth] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [copilotFlow, setCopilotFlow] = useState<CopilotDeviceFlowStart | null>(null);
  const [copilotFlowStatus, setCopilotFlowStatus] = useState<string>("");
  const [copilotPollIntervalSec, setCopilotPollIntervalSec] = useState(5);
  const [copilotBusy, setCopilotBusy] = useState(false);

  const setupGuidance = useMemo(() => {
    switch (providerId) {
      case "codex":
        return "Run Codex CLI login first (auth.json), then test connection.";
      case "claude":
        return "Install and log in to Claude CLI, then test connection.";
      case "gemini":
        return "Install Gemini CLI and authenticate OAuth credentials.";
      case "kiro":
        return "Install Kiro CLI in your host/WSL environment.";
      case "copilot":
        return "Use GitHub auth token (or gh hosts.yml token) for Copilot usage API.";
      case "cursor":
        return "Paste a full Cookie header from cursor.com, or reuse CodexBar session cache.";
      case "jetbrains":
        return "No token required. AIGauge reads JetBrains local quota files automatically.";
      default:
        return "Configure provider credential and test connection.";
    }
  }, [providerId]);

  const isCredentialOptional = providerId === "jetbrains" || authMethod === "none";
  const isCopilotProvider = providerId === "copilot";
  const isJetBrainsProvider = providerId === "jetbrains";

  useEffect(() => {
    if (!open) {
      setCredential("");
      setJetbrainsPath("");
      setHealth("");
      setCopilotFlow(null);
      setCopilotFlowStatus("");
      setCopilotPollIntervalSec(5);
    }
  }, [open, providerId]);

  const label = useMemo(() => {
    if (providerId === "cursor") return "Cookie Header";
    if (providerId === "jetbrains") return "JetBrains IDE Base Path (Optional)";
    if (authMethod === "none") return "No credential required";
    if (authMethod === "oauth") return "OAuth Token";
    if (authMethod === "token") return "Access Token";
    return "API Key";
  }, [authMethod, providerId]);

  const runHealthCheck = useCallback(async () => {
    if (!providerId) return;
    const status = await providerApi.checkHealth(providerId);
    setHealth(
      status.configured && status.reachable
        ? "Connected"
        : status.configured
          ? "Configured but unreachable"
          : "Not configured",
    );
  }, [providerApi, providerId]);

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
        setHealth("Connected");
        await runHealthCheck();
        onSaved();
      } else if (result.message) {
        setHealth(result.message);
      }
    } finally {
      setCopilotBusy(false);
    }
  }, [copilotFlow, onSaved, providerApi, runHealthCheck]);

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
      setHealth("Open verification URL and complete GitHub login.");
    } finally {
      setCopilotBusy(false);
    }
  }, [providerApi]);

  const save = async () => {
    if (!providerId) return;
    if (isJetBrainsProvider) {
      setLoading(true);
      try {
        if (jetbrainsPath.trim()) {
          await providerApi.saveCredential(providerId, jetbrainsPath.trim());
        } else {
          await providerApi.deleteCredential(providerId);
        }
        await runHealthCheck();
        onSaved();
      } finally {
        setLoading(false);
      }
      return;
    }

    if (isCredentialOptional) {
      await runHealthCheck();
      onSaved();
      return;
    }

    setLoading(true);
    try {
      await providerApi.saveCredential(providerId, credential);
      await runHealthCheck();
      setCredential("");
      onSaved();
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Setup Provider</DialogTitle>
          <DialogDescription>
            Configure {providerId || "provider"} credential.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <label className="text-sm font-medium" htmlFor="provider-credential">
            {label}
          </label>
          {isCredentialOptional && !isJetBrainsProvider ? (
            <div className="rounded-md border border-border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
              Local data source will be used automatically.
            </div>
          ) : (
            <input
              id="provider-credential"
              className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
              type={isJetBrainsProvider ? "text" : "password"}
              value={isJetBrainsProvider ? jetbrainsPath : credential}
              onChange={(event) =>
                isJetBrainsProvider
                  ? setJetbrainsPath(event.currentTarget.value)
                  : setCredential(event.currentTarget.value)
              }
              placeholder={`Enter ${label}`}
            />
          )}

          {isCopilotProvider ? (
            <div className="space-y-2 rounded-md border border-border bg-muted/20 p-3 text-xs">
              <p className="text-muted-foreground">
                Recommended: sign in with GitHub Device Flow.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={startCopilotLogin}
                  disabled={copilotBusy || loading}
                >
                  Sign in with GitHub
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={pollCopilotLogin}
                  disabled={!copilotFlow || copilotBusy || loading}
                >
                  Check Login Status
                </Button>
              </div>
              {copilotFlow ? (
                <div className="space-y-1">
                  <p>
                    Code: <strong>{copilotFlow.user_code}</strong>
                  </p>
                  <a
                    className="underline"
                    href={copilotFlow.verification_uri_complete || copilotFlow.verification_uri}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {copilotFlow.verification_uri_complete || copilotFlow.verification_uri}
                  </a>
                  {copilotFlowStatus ? (
                    <p className="text-muted-foreground">Login status: {copilotFlowStatus}</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">{setupGuidance}</p>
          {health ? <p className="text-xs text-muted-foreground">Status: {health}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={runHealthCheck}>
            Test Connection
          </Button>
          <Button
            disabled={
              loading || (copilotBusy && !isCredentialOptional) || (!isCredentialOptional && !isJetBrainsProvider && !credential)
            }
            onClick={save}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
