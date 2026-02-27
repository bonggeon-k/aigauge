import type { ReactNode } from "react";
import { Separator } from "@/components/ui/separator";

interface TrayViewProps {
  children: ReactNode;
}

export const TrayView = ({ children }: TrayViewProps) => (
  <section className="mx-auto w-full max-w-4xl rounded-xl border border-border/70 bg-background/70 p-4 shadow-sm backdrop-blur">
    <div className="mb-3">
      <h2 className="text-sm font-medium">Tray Overview</h2>
      <p className="text-xs text-muted-foreground">Quick glance while coding</p>
    </div>
    <Separator className="mb-4" />
    {children}
  </section>
);
