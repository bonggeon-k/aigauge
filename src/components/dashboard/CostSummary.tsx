import { Pie, PieChart, ResponsiveContainer, Cell, Tooltip } from "recharts";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import type { DashboardEntry } from "@/hooks/useProvider";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface CostSummaryProps {
  entries: DashboardEntry[];
}

const colors = ["#0f766e", "#1d4ed8", "#fb923c", "#f59e0b", "#ef4444", "#6366f1"];

export const CostSummary = ({ entries }: CostSummaryProps) => {
  const data = entries
    .map((entry) => ({
      name: entry.info.name,
      value: entry.cost?.status === "ok" ? entry.cost.total : 0,
    }))
    .filter((item) => item.value > 0);

  const total = data.reduce((sum, item) => sum + item.value, 0);
  const previous = total * 0.91;
  const diff = previous > 0 ? ((total - previous) / previous) * 100 : 0;

  return (
    <Card className="flex h-full min-h-[260px] border-border/70 bg-card/90">
      <CardHeader>
        <CardTitle>Cost Summary</CardTitle>
      </CardHeader>
      <CardContent className="grid flex-1 gap-4 md:grid-cols-2">
        <div>
          <p className="text-sm text-muted-foreground">Monthly total</p>
          <p className="text-3xl font-semibold">
            {new Intl.NumberFormat("en-US", {
              style: "currency",
              currency: "USD",
            }).format(total)}
          </p>
          <p className="mt-2 flex items-center gap-1 text-sm">
            {diff >= 0 ? (
              <ArrowUpRight className="h-4 w-4 text-red-500" />
            ) : (
              <ArrowDownRight className="h-4 w-4 text-emerald-500" />
            )}
            <span className={diff >= 0 ? "text-red-500" : "text-emerald-500"}>
              {Math.abs(diff).toFixed(1)}%
            </span>
            <span className="text-muted-foreground">vs last month</span>
          </p>
        </div>
        <div className="h-52 min-h-[13rem]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
              >
                {data.map((_, index) => (
                  <Cell key={`slice-${index}`} fill={colors[index % colors.length]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: number | string | undefined) =>
                  new Intl.NumberFormat("en-US", {
                    style: "currency",
                    currency: "USD",
                  }).format(typeof value === "number" ? value : 0)
                }
              />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
};
