import { Slider } from "@/components/ui/slider";
import { Lock } from "lucide-react";
import type { Measure } from "@/lib/api/types";
import { chf, kg } from "@/lib/format";
import { TARGETS } from "@/lib/optimizer";
import { useApp, toggleId } from "@/lib/store";
import { cn } from "@/lib/utils";
import { RiskBadge } from "./ui";

export function BudgetSlider({
  value,
  onChange,
}: { value?: number; onChange?: (budget: number) => void } = {}) {
  const { s, set } = useApp();
  const budget = value ?? s.budgetChf;
  return (
    <div>
      <div className="mb-2 flex flex-wrap gap-2 justify-between text-sm">
        <span>Implementation budget</span>
        <span className="num font-semibold text-primary">
          {chf(budget)} · {(budget / TARGETS.chfPerPersonDay).toFixed(1)} PD
        </span>
      </div>
      <Slider
        value={[budget]}
        min={1100}
        max={TARGETS.budgetChf}
        step={550}
        onValueChange={(v) =>
          onChange
            ? onChange(v[0] ?? TARGETS.budgetChf)
            : set({ budgetChf: v[0] ?? TARGETS.budgetChf })
        }
        aria-label="Implementation budget"
      />
      <div className="mt-1 flex justify-between text-[11px] text-muted-foreground">
        <span>CHF 1,100</span>
        <span>Max CHF 16,500 (15 PD)</span>
      </div>
    </div>
  );
}

/** Compact select/deselect list; shares the plan with every other view. */
export function PortfolioBuilder({ measures }: { measures: Measure[] }) {
  const { s, set } = useApp();
  return (
    <ul className="space-y-1.5">
      {measures.map((m) => {
        const on = s.measureIds.includes(m.id);
        const blocked = m.risk.level === "blocked" || !m.includable;
        return (
          <li key={m.id}>
            <button
              disabled={blocked}
              onClick={() => set({ measureIds: toggleId(s.measureIds, m.id) })}
              className={cn(
                "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left text-sm transition",
                on ? "border-primary/60 bg-primary/10" : "hover:border-primary/40",
                blocked && "cursor-not-allowed opacity-70",
              )}
            >
              <span
                className={cn(
                  "grid h-4 w-4 shrink-0 place-items-center rounded border",
                  on && "border-primary bg-primary",
                )}
              >
                {blocked && <Lock className="h-3 w-3 text-destructive" />}
              </span>
              <span className="flex-1 truncate">{m.title}</span>
              <span className="hidden sm:block">
                <RiskBadge level={m.risk.level} />
              </span>
              <span className="num w-20 text-right text-xs text-info">{chf(m.savingsChf)}</span>
              <span className="num w-16 text-right text-xs text-success">
                {kg(m.savingsCo2KgLocation)}
              </span>
              <span className="num w-12 text-right text-xs text-muted-foreground">
                {m.effortPersonDays} PD
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
