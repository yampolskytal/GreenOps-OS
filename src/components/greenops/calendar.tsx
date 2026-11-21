import { useState } from "react";
import type { DailyFootprint } from "@/lib/api/types";
import { chf, kg, kwh } from "@/lib/format";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowLeft, ArrowRight, ArrowLeftRight } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import ContributionSkyline from "./contribution-skyline";
export type CalMetric = "co2Kg" | "costChf" | "energyKwh";
const fmt = { co2Kg: kg, costChf: chf, energyKwh: kwh };
export function FootprintCalendar({ days, metric }: { days: DailyFootprint[]; metric: CalMetric }) {
  const [view, setView] = useState<"2d" | "3d">("2d");
  const [period, setPeriod] = useState<"year" | "month">("year");
  const months = [...new Set(days.map((d) => d.date.slice(0, 7)))].sort();
  const [selectedMonth, setMonth] = useState("");
  const month = selectedMonth || months.at(-1) || "";
  const [swap, setSwap] = useState(false);
  const [sel, setSel] = useState<DailyFootprint | null>(null);
  if (!days.length)
    return (
      <p className="py-12 text-center text-muted-foreground">
        Daily footprint data is unavailable.
      </p>
    );
  const heightMetric = swap ? "costChf" : "co2Kg",
    colorMetric = view === "2d" ? metric : swap ? "co2Kg" : "costChf";
  const desc = (d: DailyFootprint) =>
    `${d.date} · ${chf(d.costChf)} · ${kg(d.co2Kg)} CO₂ · ${kwh(d.energyKwh)} · ${d.coverage}`;
  const data = days.map((d) => ({
    date: d.date,
    count: d[heightMetric],
    colorCount: d[colorMetric],
    detail: desc(d),
  }));
  const shown = days.filter((d) => d.date.startsWith(month));
  const first = new Date(`${month}-01T00:00:00Z`);
  const start = (first.getUTCDay() + 6) % 7;
  const length = new Date(first.getUTCFullYear(), first.getUTCMonth() + 1, 0).getDate();
  const max = Math.max(1, ...shown.map((d) => d[metric]));
  return (
    <div>
      <div className="mb-5 flex flex-wrap items-center gap-2">
        {(["year", "month"] as const).map((p) => (
          <Button
            key={p}
            size="sm"
            variant={period === p ? "secondary" : "ghost"}
            onClick={() => setPeriod(p)}
          >
            {p === "year" ? "Year" : "Month"}
          </Button>
        ))}
        {period === "month" ? (
          <>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Previous month"
              disabled={months.indexOf(month) <= 0}
              onClick={() => setMonth(months[months.indexOf(month) - 1] ?? month)}
            >
              <ArrowLeft />
            </Button>
            <Select value={month} onValueChange={setMonth}>
              <SelectTrigger className="w-36" aria-label="Calendar month">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {months.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              size="icon"
              variant="ghost"
              aria-label="Next month"
              disabled={months.indexOf(month) >= months.length - 1}
              onClick={() => setMonth(months[months.indexOf(month) + 1] ?? month)}
            >
              <ArrowRight />
            </Button>
          </>
        ) : (
          view === "3d" && (
            <Button size="sm" variant="outline" onClick={() => setSwap(!swap)}>
              <ArrowLeftRight />
              Swap height / color
            </Button>
          )
        )}
      </div>
      {period === "year" ? (
        <ContributionSkyline
          data={data}
          view={view}
          onViewChange={setView}
          weekStart={1}
          palette={["var(--heat-1)", "var(--heat-2)", "var(--heat-3)", "var(--heat-4)"]}
          showStats={false}
          showLegend
          title={`${days[0]?.date} — ${days.at(-1)?.date}`}
          footer={
            view === "3d"
              ? `Linear height: ${swap ? "cost (CHF)" : "CO₂ (kg)"} · Color: ${swap ? "CO₂ (kg)" : "cost (CHF)"} · independent scales`
              : `Color: ${metric === "co2Kg" ? "CO₂ (kg)" : metric === "costChf" ? "cost (CHF)" : "energy (kWh)"}`
          }
          onCellClick={(d) => setSel(days.find((x) => x.date === d.date) ?? null)}
        />
      ) : (
        <div className="mx-auto grid max-w-3xl grid-cols-7 gap-2">
          {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
            <span key={d} className="text-center text-xs text-muted-foreground">
              {d}
            </span>
          ))}
          {Array.from({ length: start }, (_, i) => (
            <span key={`blank-${i}`} />
          ))}
          {Array.from({ length }, (_, i) => {
            const date = `${month}-${String(i + 1).padStart(2, "0")}`;
            const d = shown.find((x) => x.date === date);
            return (
              <Button
                key={date}
                variant="ghost"
                className={cn(
                  "h-auto aspect-square flex-col rounded-md border p-1",
                  !d && "border-dashed text-muted-foreground",
                )}
                aria-label={d ? desc(d) : `${date}: unavailable`}
                title={d ? desc(d) : "Unavailable"}
                onClick={() => d && setSel(d)}
                style={
                  d
                    ? {
                        background: `color-mix(in oklab, var(--heat-4) ${15 + (d[metric] / max) * 85}%, var(--heat-1))`,
                      }
                    : undefined
                }
              >
                <span>{i + 1}</span>
                {d?.holiday && <span className="size-1 rounded-full bg-warning" />}
              </Button>
            );
          })}
        </div>
      )}
      <p className="mt-4 text-xs text-muted-foreground">
        Daily coverage: {days.filter((d) => d.coverage === "measured").length} measured ·{" "}
        {days.filter((d) => d.coverage === "allocated").length} allocated ·{" "}
        {days.filter((d) => d.coverage === "estimated").length} estimated. Missing dates are
        unavailable, not zero.
      </p>
      <Sheet
        open={sel != null}
        onOpenChange={(o) => {
          if (!o) setSel(null);
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
          <SheetHeader>
            <SheetTitle>{sel?.date ?? "Day details"}</SheetTitle>
            <SheetDescription>
              {sel?.coverage === "allocated"
                ? "Allocated from weekly/monthly sources; not a daily observation."
                : sel?.coverage === "estimated"
                  ? "Estimated daily value; source limitations apply."
                  : "Measured daily"}
            </SheetDescription>
          </SheetHeader>
          {sel && (
            <div className="mt-6 space-y-4 text-sm">
              <p className="num">
                {chf(sel.costChf)} · {kg(sel.co2Kg)} CO₂ · {kwh(sel.energyKwh)}
              </p>
              <p>{sel.holiday ?? (sel.workday ? "Workday" : "Weekend")}</p>
              <h4 className="font-semibold">CO₂ contributors</h4>
              {sel.contributors.map((c) => (
                <div key={c.label} className="flex justify-between gap-4">
                  <span>{c.label}</span>
                  <span>{kg(c.co2Kg)}</span>
                </div>
              ))}
              <p className="text-muted-foreground">
                Day-level source references and allocation methodology are not supplied by the
                current daily API. Confirm with the team before treating estimates as measured
                evidence.
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
