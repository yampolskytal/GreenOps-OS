import type { ReactNode } from "react";
import { AnalyticalInspector } from "./analytical-inspector";
import { Button } from "@/components/ui/button";
export function DetailDrawer({
  title,
  description,
  trigger,
  children,
}: {
  title: string;
  description?: string;
  trigger: ReactNode;
  children: ReactNode;
}) {
  return (
    <AnalyticalInspector title={title} {...(description ? { description } : {})} trigger={trigger}>
      {children}
    </AnalyticalInspector>
  );
}
export function DetailBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h4 className="mb-2 text-xs font-semibold uppercase text-muted-foreground">{title}</h4>
      {children}
    </section>
  );
}
export function DetailButton() {
  return (
    <Button variant="ghost" size="sm">
      Details
    </Button>
  );
}
