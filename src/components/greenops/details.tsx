import type { ReactNode } from "react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { DemoTag } from "./ui";
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
    <Sheet>
      <SheetTrigger asChild>{trigger}</SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            {description ?? "Evidence, assumptions and planning limitations"} <DemoTag />
          </SheetDescription>
        </SheetHeader>
        <div className="mt-6 space-y-5 pb-8 text-sm">{children}</div>
      </SheetContent>
    </Sheet>
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
