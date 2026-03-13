import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [lastSavedPath, setLastSavedPath] = useState<string | null>(null);

  const api = useMemo(
    () => ({
      async exportData(request: ExportRequest): Promise<string> {
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
          if (!isTauriRuntime) {
            const payload = JSON.stringify({ preview: true, request }, null, 2);
            setSuccess(t("analytics.export.messages.previewReady"));
            return payload;
          }
          const data = await invoke<string>("export_data", { request });
          setSuccess(t("analytics.export.messages.exportReady"));
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
            setSuccess(t("analytics.export.messages.exportSavedShort"));
            setLastSavedPath(fallbackPath);
            return fallbackPath;
          }
          const savedPath = await invoke<string>("export_to_file", { request, path });
          setSuccess(t("analytics.export.messages.exportSavedShort"));
          setLastSavedPath(savedPath);
          return savedPath;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          throw err;
        } finally {
          setLoading(false);
        }
      },

      async openExportsFolder(): Promise<string> {
        setLoading(true);
        setError(null);
        setSuccess(null);
        try {
          if (!isTauriRuntime) {
            const fallbackPath = "/tmp";
            setSuccess(t("analytics.export.messages.folderOpenedShort"));
            return fallbackPath;
          }
          const folderPath = await invoke<string>("open_exports_folder");
          setSuccess(t("analytics.export.messages.folderOpenedShort"));
          return folderPath;
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          setError(message);
          throw err;
        } finally {
          setLoading(false);
        }
      },
    }),
    [t],
  );

  return { ...api, loading, error, success, lastSavedPath };
};
