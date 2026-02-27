import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { motion } from "framer-motion";
import type { RoiAnalysis } from "@/hooks/useCostAnalytics";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface ROICalculatorProps {
  roi: RoiAnalysis | null;
}

export const ROICalculator = ({ roi }: ROICalculatorProps) => {
  if (!roi) {
    return (
      <Card className="border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
        <p className="text-sm text-muted-foreground">No ROI data yet.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 overflow-hidden border-border/70 bg-[var(--glass-bg)] p-4 shadow-[var(--shadow-soft)]">
      <div className="pointer-events-none h-1 rounded-full bg-gradient-to-r from-[var(--chart-2)] via-[var(--chart-3)] to-[var(--chart-5)]" />
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold tracking-tight">ROI Calculator</h3>
        {roi.best_value_provider ? <Badge className="bg-[var(--chart-6)] text-black">{roi.best_value_provider} best value</Badge> : null}
      </div>

      <motion.div className="h-56 rounded-xl bg-[var(--surface-1)] p-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <p className="sr-only">Bar chart for cost per request by provider.</p>
        <ResponsiveContainer>
          <BarChart data={roi.entries}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="provider" />
            <YAxis />
            <Tooltip
              formatter={(value: number | string | undefined) =>
                `$${Number(value ?? 0).toFixed(4)}`
              }
            />
            <Bar dataKey="cost_per_request" fill="var(--chart-2)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      <motion.div className="h-56 rounded-xl bg-[var(--surface-1)] p-2" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}>
        <p className="sr-only">Bar chart for cost per one thousand tokens by provider.</p>
        <ResponsiveContainer>
          <BarChart data={roi.entries}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="provider" />
            <YAxis />
            <Tooltip
              formatter={(value: number | string | undefined) =>
                `$${Number(value ?? 0).toFixed(4)}`
              }
            />
            <Bar dataKey="cost_per_1k_tokens" fill="var(--chart-3)" radius={[6, 6, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      <div className="overflow-x-auto rounded-xl border border-border/70 bg-[var(--surface-1)] p-2">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-2 pl-2">Provider</th>
              <th className="pb-2">Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {[...roi.entries]
              .sort((a, b) => b.efficiency_score - a.efficiency_score)
              .map((entry) => (
                <tr key={entry.provider} className="border-t border-border/60">
                  <td className="py-2 pl-2 font-medium uppercase tracking-[0.08em]">{entry.provider}</td>
                  <td className="py-2">{entry.efficiency_score.toFixed(2)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
