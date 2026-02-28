import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type ExportFormat = "csv" | "json";

export interface ExportRequest {
  format: ExportFormat;
  date_range?: {
    start?: string;
    end?: string;
  };
  providers?: string[];
  include_cost: boolean;
}

const isTauriRuntime =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>);

export const useExport = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const api = useMemo(
    () => ({
      async exportData(request: ExportRequest): Promise<string> {
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
          if (!isTauriRuntime) {
            const payload = JSON.stringify({ preview: true, request }, null, 2);
            setSuccess("preview generated");
            return payload;
          }
          const data = await invoke<string>("export_data", { request });
          setSuccess("export generated");
          return data;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          throw err;
        } finally {
          setLoading(false);
        }
      },

      async exportToFile(request: ExportRequest, path: string): Promise<string> {
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
          if (!isTauriRuntime) {
            const fallbackPath = path || "/tmp/aigauge-export.mock";
            setSuccess(`export saved to ${fallbackPath}`);
            return fallbackPath;
          }
          const savedPath = await invoke<string>("export_to_file", { request, path });
          setSuccess(`export saved to ${savedPath}`);
          return savedPath;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          throw err;
        } finally {
          setLoading(false);
        }
      },
    }),
    [],
  );

  return { ...api, loading, error, success };
};
