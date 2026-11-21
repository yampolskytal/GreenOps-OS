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
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <div className="inspector-layout" data-inspector={active != null ? "open" : "closed"}>
        <div className="inspector-main min-w-0">{children}</div>
        <aside ref={setTarget} className="inspector-slot" aria-label="Analysis details" />
      </div>
    </InspectorContext.Provider>
  );
}
export function AnalyticalInspector({
  title,
  description,
  trigger,
  children,
  open: requestedOpen,
  onOpenChange,
}: {
  title: string;
  description?: ReactNode;
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const ctx = useContext(InspectorContext);
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const wasOpen = useRef(false);
  const open = ctx?.active === id;
  const setActive = ctx?.setActive;
  const current = useRef(ctx);
  current.current = ctx;
  const callback = useRef(onOpenChange);
  callback.current = onOpenChange;
  useEffect(() => {
    if (requestedOpen === true) setActive?.(id);
    else if (requestedOpen === false && current.current?.active === id) setActive?.(null);
  }, [requestedOpen, id, setActive]);
  useEffect(() => {
    if (wasOpen.current && !open) callback.current?.(false);
    wasOpen.current = open;
  }, [open]);
  const close = () => {
    setActive?.(null);
    callback.current?.(false);
    anchor.current?.querySelector<HTMLElement>("button")?.focus();
  };
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActive?.(null);
        callback.current?.(false);
        anchor.current?.querySelector<HTMLElement>("button")?.focus();
      }
    };
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [open, setActive]);
  useEffect(
    () => () => {
      if (wasOpen.current) setActive?.(null);
    },
    [setActive],
  );
  return (
    <>
      <span
        ref={anchor}
        className="inline-flex max-w-full"
        onClick={() => {
          setActive?.(open ? null : id);
          callback.current?.(!open);
        }}
      >
        {trigger}
      </span>
      {open &&
        ctx?.target &&
        createPortal(
          <div
            className="flex h-full min-h-0 flex-col"
            role="complementary"
            aria-labelledby={`${id}-title`}
          >
            <header className="flex items-start gap-3 border-b bg-background p-5">
              <div className="min-w-0 flex-1">
                {!ctx.desktop && (
                  <Button variant="ghost" size="sm" className="mb-3" onClick={close}>
                    <ArrowLeft />
                    Back to Analysis
                  </Button>
                )}
                <h2 id={`${id}-title`} className="break-words font-semibold">
                  {title}
                </h2>
                <div className="mt-2 text-xs text-muted-foreground">
                  {description ?? "Evidence, assumptions and planning limitations"}
                  {api.isDemo && " · DEMO"}
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                title="Close details"
                aria-label="Close evidence"
                onClick={close}
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
