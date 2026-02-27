import { useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export interface UpdateInfo {
  version: string;
  body: string;
}

const isTauriRuntime =
  typeof window !== "undefined" &&
  "__TAURI_INTERNALS__" in (window as unknown as Record<string, unknown>);

export const useUpdater = () => {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);

  const api = useMemo(
    () => ({
      async checkForUpdate(): Promise<UpdateInfo | null> {
        setLoading(true);
        try {
          if (!isTauriRuntime) {
            return null;
          }
          const info = await invoke<UpdateInfo | null>("check_for_update");
          setUpdateAvailable(info);
          return info;
        } finally {
          setLoading(false);
        }
      },

      async installUpdate(): Promise<boolean> {
        setLoading(true);
        setProgress(20);
        try {
          if (!isTauriRuntime) {
            setProgress(100);
            return false;
          }
          const installed = await invoke<boolean>("install_update");
          setProgress(installed ? 100 : 0);
          return installed;
        } finally {
          setLoading(false);
        }
      },
    }),
    [],
  );

  return { ...api, updateAvailable, progress, loading };
};
