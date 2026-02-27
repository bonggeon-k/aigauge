import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { RoiAnalysis } from "@/hooks/useCostAnalytics";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface ROICalculatorProps {
  roi: RoiAnalysis | null;
}

export const ROICalculator = ({ roi }: ROICalculatorProps) => {
  if (!roi) {
    return (
      <Card className="p-4">
        <p className="text-sm text-muted-foreground">No ROI data yet.</p>
      </Card>
    );
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold">ROI Calculator</h3>
        {roi.best_value_provider ? <Badge>{roi.best_value_provider} best value</Badge> : null}
      </div>

      <div className="h-56">
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
      </div>

      <div className="h-56">
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
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="text-muted-foreground">
              <th className="pb-2">Provider</th>
              <th className="pb-2">Efficiency</th>
            </tr>
          </thead>
          <tbody>
            {[...roi.entries]
              .sort((a, b) => b.efficiency_score - a.efficiency_score)
              .map((entry) => (
                <tr key={entry.provider}>
                  <td className="py-1">{entry.provider}</td>
                  <td className="py-1">{entry.efficiency_score.toFixed(2)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
};
