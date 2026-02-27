import { motion } from "framer-motion";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { UsageGauge } from "@/components/dashboard/UsageGauge";

interface ProviderCardProps {
  provider: string;
  authMethod: string;
  requests: number;
  tokens: number;
  quota: number;
}

export const ProviderCard = ({
  provider,
  authMethod,
  requests,
  tokens,
  quota,
}: ProviderCardProps) => (
  <motion.div
    initial={{ opacity: 0, y: 10 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.35 }}
  >
    <Card className="h-full border-border/70 bg-card/90 shadow-md backdrop-blur-sm">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base capitalize">{provider}</CardTitle>
          <Badge variant="secondary" className="uppercase tracking-wide">
            {authMethod}
          </Badge>
        </div>
        <CardDescription>Usage snapshot for current period</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <UsageGauge used={tokens} limit={quota} label={provider} />
        <Separator />
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-muted-foreground">Requests</p>
            <p className="font-semibold">{requests.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Tokens</p>
            <p className="font-semibold">{tokens.toLocaleString()}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  </motion.div>
);
