import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetTrigger,
} from "@/components/ui/sheet";
import { api } from "@/lib/api/client";

const InspectorContext = createContext<{
  active: string | null;
  setActive: (id: string | null) => void;
  target: HTMLElement | null;
  desktop: boolean;
} | null>(null);
export function InspectorProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1180px)");
    const update = () => setDesktop(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return (
    <InspectorContext.Provider value={{ active, setActive, target, desktop }}>
      <div
        className="inspector-layout"
        data-inspector={active != null && desktop ? "open" : "closed"}
      >
        <div className="inspector-main min-w-0">{children}</div>
        <aside ref={setTarget} className="inspector-slot" aria-label="Analytical evidence" />
      </div>
    </InspectorContext.Provider>
  );
}
export function AnalyticalInspector({
  title,
  description,
  trigger,
  children,
}: {
  title: string;
  description?: ReactNode;
  trigger: ReactNode;
  children: ReactNode;
}) {
  const ctx = useContext(InspectorContext);
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const open = ctx?.active === id;
  const setActive = ctx?.setActive;
  const currentContext = useRef(ctx);
  currentContext.current = ctx;
  useEffect(() => {
    if (!open || !ctx?.desktop) return;
    const dismiss = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const region =
        anchor.current?.closest("[data-analysis-region]") ??
        anchor.current?.closest("section, article");
      if (
        panel.current?.contains(target) ||
        region?.contains(target) ||
        target.closest('[role="dialog"], [role="listbox"], [data-radix-popper-content-wrapper]')
      )
        return;
      setActive?.(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActive?.(null);
        anchor.current?.querySelector<HTMLElement>("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
    };
  }, [open, ctx?.desktop, setActive]);
  useEffect(
    () => () => {
      if (currentContext.current?.active === id) currentContext.current.setActive(null);
    },
    [id],
  );
  const desc = description ?? "Evidence, assumptions and planning limitations";
  if (!ctx?.desktop)
    return (
      <Sheet
        open={ctx ? open : mobileOpen}
        onOpenChange={(value) => (ctx ? ctx.setActive(value ? id : null) : setMobileOpen(value))}
      >
        <SheetTrigger asChild>{trigger}</SheetTrigger>
        <SheetContent className="w-full overflow-y-auto sm:max-w-xl">
          <SheetHeader>
            <SheetTitle>{title}</SheetTitle>
            <SheetDescription>
              {desc}
              {api.isDemo && " · DEMO"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6 space-y-5 pb-8 text-sm">{children}</div>
        </SheetContent>
      </Sheet>
    );
  return (
    <>
      <span ref={anchor} className="inline-flex" onClick={() => ctx.setActive(open ? null : id)}>
        {trigger}
      </span>
      {open &&
        ctx.target &&
        createPortal(
          <div
            ref={panel}
            className="flex h-full min-h-0 flex-col"
            role="complementary"
            aria-labelledby={`${id}-title`}
          >
            <header className="sticky top-0 flex items-start gap-3 border-b bg-background p-5">
              <div className="min-w-0 flex-1">
                <h2 id={`${id}-title`} className="font-semibold">
                  {title}
                </h2>
                <div className="mt-2 text-xs text-muted-foreground">
                  {desc}
                  {api.isDemo && " · DEMO"}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Close evidence"
                onClick={() => {
                  ctx.setActive(null);
                  anchor.current?.querySelector<HTMLElement>("button")?.focus();
                }}
              >
                <X />
              </Button>
            </header>
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 text-sm">{children}</div>
          </div>,
          ctx.target,
        )}
    </>
  );
}
