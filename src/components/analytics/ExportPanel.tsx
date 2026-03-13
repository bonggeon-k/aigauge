import { useMemo, useState } from "react";
import { Copy, Download, FolderOpen } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useExport, type ExportFormat } from "@/hooks/useExport";

interface ExportPanelProps {
  providers: string[];
}

export const ExportPanel = ({ providers }: ExportPanelProps) => {
  const { t } = useTranslation();
  const availableProviders = useMemo(
    () => providers.filter((provider, index) => providers.indexOf(provider) === index),
    [providers],
  );
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [excludedProviders, setExcludedProviders] = useState<string[]>([]);
  const [includeCost, setIncludeCost] = useState(true);
  const [preview, setPreview] = useState("");
  const [previewFormat, setPreviewFormat] = useState<ExportFormat>("csv");
  const [clipboardNotice, setClipboardNotice] = useState<string | null>(null);
  const exporter = useExport();

  const effectiveProviders = useMemo(
    () => availableProviders.filter((provider) => !excludedProviders.includes(provider)),
    [excludedProviders, availableProviders],
  );

  const previewRows = useMemo(() => preview.split("\n").slice(0, 6).join("\n"), [preview]);

  const previewMeta = useMemo(() => {
    if (!preview) return null;
    const bytes = new TextEncoder().encode(preview).length;
    if (previewFormat === "json") {
      try {
        const parsed = JSON.parse(preview) as { generated_at?: string; rows?: unknown[] };
        return {
          rows: Array.isArray(parsed.rows) ? parsed.rows.length : 0,
          bytes,
          generatedAt: parsed.generated_at ?? null,
        };
      } catch {
        return { rows: 0, bytes, generatedAt: null };
      }
    }
    const lines = preview.trim().split("\n");
    return {
      rows: Math.max(0, lines.length - 1),
      bytes,
      generatedAt: null,
    };
  }, [preview, previewFormat]);

  return (
    <Card className="flex h-full min-h-[18rem] min-w-0 flex-col gap-3 overflow-hidden border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)] xl:min-h-0">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-base font-semibold tracking-tight">{t("analytics.export.title")}</h3>
        <span className="rounded-full border border-border/70 bg-[var(--surface-1)] px-2.5 py-1 text-[11px] text-muted-foreground">
          {effectiveProviders.length}/{availableProviders.length}
        </span>
      </div>

      <div className="flex flex-wrap gap-1 rounded-full bg-[var(--surface-1)] p-1">
        {(["csv", "json"] as ExportFormat[]).map((option) => {
          const active = format === option;
          return (
            <button
              key={option}
              type="button"
              className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                active ? "bg-[var(--nav-active)] text-[var(--nav-active-fg)]" : "text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setFormat(option)}
            >
              {option.toUpperCase()}
            </button>
          );
        })}
      </div>

      <div className="grid gap-2 rounded-xl border border-border/70 bg-[var(--surface-1)] p-3 text-xs">
        <label className="inline-flex items-center gap-2">
          <input type="checkbox" checked={includeCost} onChange={(event) => setIncludeCost(event.target.checked)} />
          {t("analytics.export.includeCost")}
        </label>
        <p className="text-muted-foreground">
          {t("analytics.export.providers")}: {effectiveProviders.length}
        </p>
        <div className="max-h-24 overflow-auto pr-1">
          <div className="grid gap-2 sm:grid-cols-2">
            {availableProviders.map((provider) => {
              const checked = effectiveProviders.includes(provider);
              return (
                <label
                  key={provider}
                  className="inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background/50 px-2 py-1.5"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(event) => {
                      if (event.target.checked) {
                        setExcludedProviders((prev) => prev.filter((item) => item !== provider));
                      } else {
                        setExcludedProviders((prev) => (prev.includes(provider) ? prev : [...prev, provider]));
                      }
                    }}
                  />
                  <span className="truncate uppercase tracking-[0.06em]">{provider}</span>
                </label>
              );
            })}
          </div>
        </div>
      </div>

      <div className="min-h-0 min-w-0 flex-1 rounded-xl border border-border/70 bg-[var(--surface-1)] p-3 text-xs">
        <div className="mb-2 flex items-center justify-between gap-2 text-muted-foreground">
          <p>{t("analytics.export.preview")}</p>
          {previewMeta ? (
            <p>
              {t("analytics.export.rows")}: {previewMeta.rows} · {t("analytics.export.size")}:{" "}
              {t("analytics.export.bytesUnit", { count: previewMeta.bytes })}
            </p>
          ) : (
            <p>-</p>
          )}
        </div>
        <pre className="h-36 max-w-full overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border/70 bg-[var(--surface-2)] p-3 font-mono text-[11px] leading-relaxed xl:h-32">
          {previewRows || "…"}
        </pre>
        <p className="mt-2 text-muted-foreground">
          {t("analytics.export.generated")}: {previewMeta?.generatedAt ?? "-"}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Button
          onClick={async () => {
            setClipboardNotice(null);
            const payload = await exporter.exportData({
              format,
              include_cost: includeCost,
              providers: effectiveProviders,
            });
            if (format === "json") {
              try {
                const parsed = JSON.parse(payload) as unknown;
                setPreview(JSON.stringify(parsed, null, 2));
              } catch {
                setPreview(payload);
              }
            } else {
              setPreview(payload);
            }
            setPreviewFormat(format);
          }}
          disabled={exporter.loading || effectiveProviders.length === 0}
        >
          {t("analytics.export.preview")}
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            setClipboardNotice(null);
            await exporter.exportToFile(
              {
                format,
                include_cost: includeCost,
                providers: effectiveProviders,
              },
              "",
            );
          }}
          disabled={exporter.loading || effectiveProviders.length === 0}
        >
          <Download className="mr-2 h-4 w-4" />
          {t("analytics.export.download")}
        </Button>
      </div>

      <div className="rounded-xl border border-border/70 bg-[var(--surface-1)] p-3 text-xs">
        <p className="text-muted-foreground">{t("analytics.export.lastSaved")}</p>
        <p className="mt-1 min-h-9 break-all rounded-lg border border-border/70 bg-[var(--surface-2)] px-3 py-2 text-muted-foreground">
          {exporter.lastSavedPath ?? "-"}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={async () => {
              if (!exporter.lastSavedPath) return;
              try {
                await navigator.clipboard.writeText(exporter.lastSavedPath);
                setClipboardNotice(t("analytics.export.pathCopied"));
              } catch {
                setClipboardNotice(t("analytics.export.clipboardUnavailable"));
              }
            }}
            disabled={!exporter.lastSavedPath}
          >
            <Copy className="mr-2 h-3.5 w-3.5" />
            {t("analytics.export.copyPath")}
          </Button>
          <Button size="sm" variant="outline" onClick={async () => exporter.openExportsFolder()} disabled={exporter.loading}>
            <FolderOpen className="mr-2 h-3.5 w-3.5" />
            {t("analytics.export.openFolder")}
          </Button>
        </div>
        {clipboardNotice ? (
          <p className="mt-2 max-w-full whitespace-pre-wrap break-all text-muted-foreground">{clipboardNotice}</p>
        ) : null}
        {exporter.error ? (
          <p className="mt-1 max-w-full whitespace-pre-wrap break-all text-destructive">{exporter.error}</p>
        ) : null}
        {exporter.success ? (
          <p className="mt-1 max-w-full whitespace-pre-wrap break-all text-muted-foreground">{exporter.success}</p>
        ) : null}
      </div>
    </Card>
  );
};
