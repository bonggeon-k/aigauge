import { useMemo, useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useExport, type ExportFormat } from "@/hooks/useExport";

interface ExportPanelProps {
  providers: string[];
}

export const ExportPanel = ({ providers }: ExportPanelProps) => {
  const [format, setFormat] = useState<ExportFormat>("csv");
  const [selectedProviders, setSelectedProviders] = useState<string[]>(providers);
  const [includeCost, setIncludeCost] = useState(true);
  const [preview, setPreview] = useState("");
  const exporter = useExport();

  const previewRows = useMemo(
    () => preview.split("\n").slice(0, 6).join("\n"),
    [preview],
  );

  return (
    <Card className="space-y-4 overflow-hidden border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
      <div className="pointer-events-none h-1 rounded-full bg-gradient-to-r from-[var(--chart-4)] via-[var(--chart-2)] to-[var(--chart-6)]" />
      <h3 className="text-base font-semibold tracking-tight">Export</h3>
      <div className="flex flex-wrap gap-2 rounded-full bg-[var(--surface-1)] p-1">
        {(["csv", "json", "pdf"] as ExportFormat[]).map((option) => (
          <Button
            key={option}
            variant={format === option ? "default" : "ghost"}
            size="sm"
            className={format === option ? "rounded-full" : "rounded-full"}
            onClick={() => setFormat(option)}
          >
            {option.toUpperCase()}
          </Button>
        ))}
      </div>

      <div className="space-y-2 rounded-xl bg-[var(--surface-1)] p-3 text-xs">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeCost}
            onChange={(event) => setIncludeCost(event.target.checked)}
          />
          Include cost fields
        </label>
        <p className="text-muted-foreground">Providers</p>
        <div className="flex flex-wrap gap-2">
          {providers.map((provider) => {
            const checked = selectedProviders.includes(provider);
            return (
              <label key={provider} className="flex items-center gap-1 rounded-full border border-border/70 bg-background/50 px-2 py-1">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(event) => {
                    if (event.target.checked) {
                      setSelectedProviders((prev) => [...prev, provider]);
                    } else {
                      setSelectedProviders((prev) => prev.filter((item) => item !== provider));
                    }
                  }}
                />
                {provider}
              </label>
            );
          })}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          onClick={async () => {
            const payload = await exporter.exportData({
              format,
              include_cost: includeCost,
              providers: selectedProviders,
            });
            setPreview(payload);
          }}
          disabled={exporter.loading}
        >
          Preview
        </Button>
        <Button
          variant="outline"
          onClick={async () => {
            await exporter.exportToFile({
              format,
              include_cost: includeCost,
              providers: selectedProviders,
            }, "");
          }}
          disabled={exporter.loading}
        >
          <Download className="mr-2 h-4 w-4" />
          Download
        </Button>
      </div>

      <pre className="max-h-40 overflow-auto rounded-xl border border-border/70 bg-[var(--surface-2)] p-3 font-mono text-[11px]">{previewRows}</pre>
      {exporter.error ? <p className="text-xs text-destructive">{exporter.error}</p> : null}
      {exporter.success ? <p className="text-xs text-muted-foreground">{exporter.success}</p> : null}
    </Card>
  );
};
