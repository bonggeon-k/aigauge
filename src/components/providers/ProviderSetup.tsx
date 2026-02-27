import { useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { AuthMethod } from "@/hooks/useProvider";
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
  const [health, setHealth] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const label = useMemo(() => {
    if (authMethod === "oauth") return "OAuth Token";
    if (authMethod === "token") return "Access Token";
    return "API Key";
  }, [authMethod]);

  const runHealthCheck = async () => {
    if (!providerId) return;
    const status = await providerApi.checkHealth(providerId);
    setHealth(
      status.configured && status.reachable
        ? "Connected"
        : status.configured
          ? "Configured but unreachable"
          : "Not configured",
    );
  };

  const save = async () => {
    if (!providerId) return;
    setLoading(true);
    try {
      await providerApi.saveCredential(providerId, credential);
      await runHealthCheck();
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
          <input
            id="provider-credential"
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
            type="password"
            value={credential}
            onChange={(event) => setCredential(event.currentTarget.value)}
            placeholder={`Enter ${label}`}
          />
          {health ? <p className="text-xs text-muted-foreground">Status: {health}</p> : null}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={runHealthCheck}>
            Test Connection
          </Button>
          <Button disabled={!credential || loading} onClick={save}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
