import {
  createContext,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Dispatch,
  type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";

const InspectorContext = createContext<{
  active: string | null;
  setActive: Dispatch<SetStateAction<string | null>>;
  target: HTMLElement | null;
  desktop: boolean;
} | null>(null);
type NestedDetails = { title: string; description?: ReactNode; children: ReactNode };
const NestedInspectorContext = createContext<((details: NestedDetails) => void) | null>(null);
export function InspectorProvider({ children }: { children: ReactNode }) {
  const [active, setActive] = useState<string | null>(null);
  const [target, setTarget] = useState<HTMLElement | null>(null);
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
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
  fullWidth = false,
  contentKey,
}: {
  title: string;
  description?: ReactNode;
  trigger: ReactNode;
  children: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  fullWidth?: boolean;
  contentKey?: string;
}) {
  const ctx = useContext(InspectorContext);
  const showNestedDetails = useContext(NestedInspectorContext);
  const [detailStack, setDetailStack] = useState<NestedDetails[]>([]);
  const currentDetails = detailStack.at(-1);
  useEffect(() => setDetailStack([]), [contentKey, title]);
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const wasOpen = useRef(false);
  const previousFocus = useRef<HTMLElement | SVGElement | null>(null);
  const open = ctx?.active === id;
  const setActive = ctx?.setActive;
  const current = useRef(ctx);
  current.current = ctx;
  const callback = useRef(onOpenChange);
  callback.current = onOpenChange;
  useEffect(() => {
    if (requestedOpen === true) {
      previousFocus.current =
        document.activeElement instanceof HTMLElement ||
        document.activeElement instanceof SVGElement
          ? document.activeElement
          : null;
      setActive?.(id);
    } else if (requestedOpen === false && current.current?.active === id)
      setActive?.((active) => (active === id ? null : active));
  }, [requestedOpen, id, setActive]);
  useEffect(() => {
    if (wasOpen.current && !open) callback.current?.(false);
    if (!open) setDetailStack([]);
    wasOpen.current = open;
  }, [open]);
  const close = () => {
    setActive?.((active) => (active === id ? null : active));
    callback.current?.(false);
    (anchor.current?.querySelector<HTMLElement>("button") ?? previousFocus.current)?.focus({
      preventScroll: true,
    });
  };
  useEffect(() => {
    if (!open) return;
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setActive?.((active) => (active === id ? null : active));
        callback.current?.(false);
        (anchor.current?.querySelector<HTMLElement>("button") ?? previousFocus.current)?.focus({
          preventScroll: true,
        });
      }
    };
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (
        !(target instanceof Element) ||
        current.current?.target?.contains(target) ||
        anchor.current?.contains(target)
      )
        return;
      if (
        target.closest(
          "[data-radix-popper-content-wrapper], [role=dialog], [role=listbox], [role=menu], [data-inspector-owned], [data-inspector-trigger], [data-inspector-interactive], button, a[href], input, select, option, textarea, label, summary, [contenteditable=true], [role=button], [role=tab], [role=combobox]",
        )
      )
        return;
      setActive?.((active) => (active === id ? null : active));
      callback.current?.(false);
      (anchor.current?.querySelector<HTMLElement>("button") ?? previousFocus.current)?.focus({
        preventScroll: true,
      });
    };
    document.addEventListener("keydown", escape);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", escape);
      document.removeEventListener("pointerdown", outside);
    };
  }, [id, open, setActive]);
  useEffect(
    () => () => {
      if (wasOpen.current) setActive?.((active) => (active === id ? null : active));
    },
    [id, setActive],
  );
  return (
    <>
      {trigger != null && (
        <span
          ref={anchor}
          data-inspector-trigger
          className={fullWidth ? "block w-full min-w-0" : "inline-flex max-w-full"}
          onClick={(event) => {
            if (showNestedDetails) {
              event.stopPropagation();
              showNestedDetails({ title, description, children });
              return;
            }
            previousFocus.current =
              document.activeElement instanceof HTMLElement ||
              document.activeElement instanceof SVGElement
                ? document.activeElement
                : null;
            setActive?.(id);
            if (!open) callback.current?.(true);
          }}
        >
          {trigger}
        </span>
      )}
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
                {currentDetails && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mb-3"
                    onClick={() => setDetailStack((stack) => stack.slice(0, -1))}
                  >
                    <ArrowLeft />
                    Back to {detailStack.length > 1 ? "previous details" : "summary"}
                  </Button>
                )}
                {!ctx.desktop && (
                  <Button variant="ghost" size="sm" className="mb-3" onClick={close}>
                    <ArrowLeft />
                    Back to Analysis
                  </Button>
                )}
                <h2 id={`${id}-title`} className="break-words font-semibold">
                  {currentDetails?.title ?? title}
                </h2>
                <div className="mt-2 text-xs text-muted-foreground">
                  {currentDetails?.description ??
                    description ??
                    "Evidence, assumptions and planning limitations"}
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
            <NestedInspectorContext.Provider
              value={(details) => setDetailStack((stack) => [...stack, details])}
            >
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-5 text-sm">
                <div hidden={currentDetails != null} className="space-y-5">
                  {children}
                </div>
                {currentDetails && <div key={detailStack.length}>{currentDetails.children}</div>}
              </div>
            </NestedInspectorContext.Provider>
          </div>,
          ctx.target,
        )}
    </>
  );
}
