import { useState } from "react";
import type { Breakdown, Breakdowns, HistoricalMetric } from "@/lib/api/types";
import { marketCoverageLabel } from "@/lib/analytics";
import { categoryShares } from "@/lib/administration";
import { useBreakdowns } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { DetailBlock, DetailDrawer } from "./details";
import { AnalyticalInspector } from "./analytical-inspector";
import { ChartCard, Q } from "./ui";

const categories = [
  ["byDepartment", "Departments"],
  ["byProvider", "Providers"],
  ["byTool", "Tools"],
  ["byService", "Service categories"],
] as const;
const metrics = [
  ["costChf", "Cost", "CHF"],
  ["co2Kg", "Location-based CO₂", "kg CO₂"],
  ["energyKwh", "Energy", "kWh"],
  ["co2KgMarket", "Market-based CO₂", "kg CO₂"],
] as const;
const colors = ["#C8FA50", "#5795ed", "#a781e6", "#eeb647", "#35b7ac", "#ee8277", "#8493ad"];
const categoryColor = (index: number) => colors[index] ?? `hsl(${(index * 137.508) % 360} 66% 53%)`;
const exact = (value: number) => value.toLocaleString("en-CH", { maximumSignificantDigits: 21 });

export function SpendingDonut() {
  const breakdowns = useBreakdowns();
  const [category, setCategory] = useState<(typeof categories)[number][0]>("byDepartment");
  const [metric, setMetric] = useState<HistoricalMetric>("costChf");
  const unit = metrics.find(([id]) => id === metric)?.[2] ?? "";
  return (
    <ChartCard title="Spending drivers">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          aria-label="Comparison category"
          className="h-9 max-w-full rounded-md border bg-card px-2 text-sm"
          value={category}
          onChange={(event) => setCategory(event.target.value as typeof category)}
        >
          {categories.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          aria-label="Comparison metric"
          className="h-9 max-w-full rounded-md border bg-card px-2 text-sm"
          value={metric}
          onChange={(event) => setMetric(event.target.value as HistoricalMetric)}
        >
          {metrics.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <Q q={breakdowns}>
          {(data) => (
            <DetailDrawer
              title="Attribution methodology"
              trigger={
                <Button size="sm" variant="outline">
                  Methodology
                </Button>
              }
            >
              <p>{data.allocationRule}</p>
            </DetailDrawer>
          )}
        </Q>
      </div>
      <Q q={breakdowns}>
        {(data) => (
          <DonutBreakdown
            key={`${category}:${metric}`}
            rows={data[category]}
            metric={metric}
            unit={unit}
            rule={data.allocationRule}
            returnedSubtotal={category === "byTool"}
          />
        )}
      </Q>
    </ChartCard>
  );
}

export function DonutBreakdown({
  rows,
  metric,
  unit,
  rule,
  returnedSubtotal = false,
}: {
  rows: Breakdown[];
  metric: HistoricalMetric;
  unit: string;
  rule: Breakdowns["allocationRule"];
  returnedSubtotal?: boolean;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const values = rows.map((row) => row[metric] ?? null);
  const { total, shares, drawable, partial } = categoryShares(values);
  const market = metric === "co2KgMarket";
  const totalLabel = total.toLocaleString("en-CH", {
    maximumFractionDigits: metric === "costChf" ? 2 : 3,
  });
  const selected = active == null ? undefined : rows[active];
  let offset = 0;
  const segments = rows.map((row, index) => {
    const share = shares[index] ?? 0;
    const segment = { row, share, offset, color: categoryColor(index) };
    offset += share;
    return segment;
  });
  const display = (index: number) => {
    const value = values[index];
    return value == null ? "Unavailable" : `${exact(value)} ${unit}`;
  };
  const shareLabel = (index: number) => {
    const share = shares[index];
    return share == null
      ? ""
      : `${share.toLocaleString("en-CH", { maximumSignificantDigits: 4 })}%`;
  };
  return (
    <div className="@container">
      {(!drawable || partial || market || returnedSubtotal) && (
        <p className="mb-4 text-sm text-muted-foreground">
          {!rows.length
            ? "No categories were supplied."
            : !drawable
              ? "Category values are listed individually. A proportional chart requires non-negative values and a positive total."
              : partial
                ? "Shares are of the supplied subtotal. Categories with unavailable values are listed below."
                : null}
          {returnedSubtotal &&
            " Tools include the categories returned by the provider. Shares use that subtotal."}
          {market &&
            " Market-based values reflect covered activity. Coverage can vary by category."}
        </p>
      )}
      <div
        className={`grid min-w-0 items-start gap-5 ${drawable ? "@2xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]" : ""}`}
      >
        {drawable && (
          <div className="relative mx-auto aspect-square w-full max-w-[22rem]">
            <svg viewBox="0 0 200 200" aria-label="Category share donut" className="size-full">
              <circle
                cx="100"
                cy="100"
                r="83"
                fill="none"
                className="stroke-muted"
                strokeWidth="24"
              />
              {segments.map(
                ({ row, share, offset, color }, index) =>
                  share > 0 && (
                    <circle
                      key={row.label}
                      data-inspector-trigger=""
                      data-category={row.label}
                      role="button"
                      tabIndex={0}
                      aria-label={`${row.label}, ${display(index)}, ${shareLabel(index)}`}
                      cx="100"
                      cy="100"
                      r="83"
                      fill="none"
                      stroke={color}
                      strokeWidth={hovered === index ? 30 : 24}
                      pathLength="100"
                      strokeDasharray={`${share} 100`}
                      strokeDashoffset={-offset}
                      transform="rotate(-90 100 100)"
                      className="cursor-pointer focus-visible:opacity-70"
                      onPointerEnter={() => setHovered(index)}
                      onPointerLeave={() => setHovered(null)}
                      onFocus={() => setHovered(index)}
                      onBlur={() => setHovered(null)}
                      onClick={() => setActive(index)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setActive(index);
                        }
                      }}
                    >
                      <title>
                        {row.label} · {display(index)} · {shareLabel(index)}
                      </title>
                    </circle>
                  ),
              )}
            </svg>
            <div className="pointer-events-none absolute inset-[20%] grid content-center overflow-hidden text-center">
              <p className="break-words text-xs text-muted-foreground">
                {hovered == null
                  ? partial || market || returnedSubtotal
                    ? "Supplied subtotal"
                    : "Total"
                  : rows[hovered]?.label}
              </p>
              <p className="num break-words text-base font-semibold @lg:text-xl">
                {hovered == null ? totalLabel : display(hovered)}
              </p>
              {hovered == null && <p className="text-xs text-muted-foreground">{unit}</p>}
              {hovered != null && (
                <p className="num text-xs text-muted-foreground">{shareLabel(hovered)}</p>
              )}
            </div>
          </div>
        )}
        <ul aria-label="Categories and shares" className="min-w-0 space-y-1">
          {segments.map(({ row, color }, index) => (
            <li key={row.label}>
              <button
                data-inspector-trigger=""
                type="button"
                onClick={() => setActive(index)}
                className="grid w-full grid-cols-[0.75rem_minmax(0,1fr)] items-baseline gap-x-2 rounded-md border-b p-2 text-left text-sm hover:bg-accent"
              >
                <span
                  data-category-color={row.label}
                  aria-hidden
                  className="size-2.5 rounded-full"
                  style={{ backgroundColor: color }}
                />
                <span className="min-w-0 break-words font-medium">{row.label}</span>
                <span className="num col-start-2 break-words text-xs text-muted-foreground">
                  {display(index)} {shareLabel(index) && `· ${shareLabel(index)}`}
                  {market && row.marketCoverage && ` · ${marketCoverageLabel(row.marketCoverage)}`}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
      <AnalyticalInspector
        title={selected?.label ?? "Entity details"}
        trigger={null}
        open={active != null}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
      >
        {selected && <EntityEvidence row={selected} rule={rule} />}
      </AnalyticalInspector>
    </div>
  );
}

function EntityEvidence({ row, rule }: { row: Breakdown; rule: string }) {
  return (
    <>
      <DetailBlock title="Annual attributed values">
        {metrics.map(([key, label, unit]) => (
          <p key={key}>
            {label} · {row[key] == null ? "Unavailable" : `${exact(row[key])} ${unit}`}
          </p>
        ))}
      </DetailBlock>
      <DetailBlock title="Attribution methodology">{rule}</DetailBlock>
      {row.marketCoverage && (
        <DetailBlock title="Market-based coverage">
          <p>{marketCoverageLabel(row.marketCoverage)}</p>
          <p>{row.marketCoverage.missingInputs.join(" · ")}</p>
          <p>{row.marketCoverage.assumptions.join(" · ")}</p>
          <p>{row.marketCoverage.sources.join(" · ")}</p>
        </DetailBlock>
      )}
    </>
  );
}
