import { useState, type ReactNode } from "react";
import type { Breakdown, Breakdowns, HistoricalMetric } from "@/lib/api/types";
import { marketCoverageLabel } from "@/lib/analytics";
import { categoryShares } from "@/lib/administration";
import { formatNumber } from "@/lib/format";
import { useBreakdowns } from "@/lib/queries";
import { DetailBlock, EvidenceInfoButton, EvidenceSources } from "./details";
import { AnalyticalInspector } from "./analytical-inspector";
import { Input } from "@/components/ui/input";
import { ChartCard, Q } from "./ui";

const categories = [
  ["byDepartment", "Departments"],
  ["byProvider", "Providers"],
  ["byTool", "Tools"],
  ["byService", "Service categories"],
] as const;
const metrics = [
  ["costChf", "Cost", "CHF"],
  ["energyKwh", "Energy", "kWh"],
  ["co2Kg", "Location-based CO₂", "kg CO₂"],
  ["co2KgMarket", "Market-based CO₂", "kg CO₂e"],
] as const;

export type SpendingSelection = {
  category: (typeof categories)[number][0];
  metric: HistoricalMetric;
};

export function SpendingDonut({
  initial,
  onSelectionChange,
  search,
  onSearchChange,
  servers,
}: {
  initial?: SpendingSelection | undefined;
  onSelectionChange?: (selection: SpendingSelection) => void;
  search?: string;
  onSearchChange?: (search: string) => void;
  servers?: {
    active: boolean;
    onChange: (active: boolean) => void;
    metricSelector: ReactNode;
    chart: ReactNode;
  };
} = {}) {
  const breakdowns = useBreakdowns(!servers?.active, !servers);
  const [localCategory, setCategory] = useState<(typeof categories)[number][0]>(
    initial?.category ?? "byDepartment",
  );
  const [localMetric, setMetric] = useState<HistoricalMetric>(initial?.metric ?? "costChf");
  const category = onSelectionChange ? initial?.category ?? localCategory : localCategory;
  const metric = onSelectionChange ? initial?.metric ?? localMetric : localMetric;
  const unit = metrics.find(([id]) => id === metric)?.[2] ?? "";
  const [selection, setSelection] = useState<{ label: string } | "methodology" | null>(null);
  return (
    <ChartCard title="Spending drivers">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          aria-label="Comparison category"
          className="h-9 max-w-full rounded-md border bg-card px-2 text-sm"
          value={servers?.active ? "servers" : category}
          onChange={(event) => {
            const value = event.target.value;
            servers?.onChange(value === "servers");
            if (value === "servers") {
              setSelection(null);
              return;
            }
            const next = value as typeof category;
            setCategory(next);
            onSelectionChange?.({ category: next, metric });
            setSelection((current) => (current ? "methodology" : null));
          }}
        >
          {categories.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
          {servers && <option value="servers">Servers</option>}
        </select>
        {servers?.active ? (
          servers.metricSelector
        ) : (
          <select
            aria-label="Comparison metric"
            className="h-9 max-w-full rounded-md border bg-card px-2 text-sm"
            value={metric}
            onChange={(event) => {
              const value = event.target.value as HistoricalMetric;
              setMetric(value);
              onSelectionChange?.({ category, metric: value });
            }}
          >
            {metrics.map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        )}
        {onSearchChange && (
          <Input
            className="h-9 w-48 max-w-full"
            aria-label="Search comparison"
            placeholder="Find an entity…"
            value={search ?? ""}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        )}
        {!servers?.active && (
          <EvidenceInfoButton
            description="spending attribution"
            onClick={() => setSelection("methodology")}
          />
        )}
      </div>
      {servers?.active ? (
        servers.chart
      ) : (
        <Q q={breakdowns}>
          {(data) => (
            <DonutBreakdown
              rows={data[category]}
              metric={metric}
              unit={unit}
              rule={data.allocationRule}
              returnedSubtotal={category === "byTool"}
              search={search}
              inspector={{ selection, setSelection }}
            />
          )}
        </Q>
      )}
    </ChartCard>
  );
}

type Selection = { label: string } | "methodology" | null;

export function donutColor(rank: number, count: number) {
  const position = rank / Math.max(1, count - 1);
  const hue = 151 - 42 * position + (rank % 2 ? -7 : 5);
  return `hsl(${Math.round(hue)} 59% ${(31 + 46 * position).toFixed(1)}%)`;
}

function amount(value: number | null | undefined, unit: string) {
  if (value == null) return "Unavailable";
  const number = formatNumber(value, { maximumFractionDigits: unit === "CHF" ? 2 : 3 });
  return unit === "CHF" ? `CHF ${number}` : `${number} ${unit}`;
}

export function DonutBreakdown({
  rows,
  metric,
  unit,
  rule,
  returnedSubtotal = false,
  inspector,
  search,
  valueFor,
  entityDetails,
  comparisonOnly = false,
}: {
  rows: Breakdown[];
  metric: HistoricalMetric;
  unit: string;
  rule: Breakdowns["allocationRule"];
  returnedSubtotal?: boolean;
  search?: string | undefined;
  valueFor?: (row: Breakdown) => number | null;
  entityDetails?: (row: Breakdown) => ReactNode;
  comparisonOnly?: boolean;
  inspector?: { selection: Selection; setSelection: (selection: Selection) => void };
}) {
  const [localSelection, setLocalSelection] = useState<Selection>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  const active = inspector ? inspector.selection : localSelection;
  const setActive = inspector?.setSelection ?? setLocalSelection;
  const sorted = rows
    .map((row) => ({ row, value: valueFor ? valueFor(row) : (row[metric] ?? null) }))
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity));
  const {
    total,
    shares,
    drawable: validComposition,
    partial,
  } = categoryShares(sorted.map(({ value }) => value));
  const drawable = !comparisonOnly && validComposition;
  const market = metric === "co2KgMarket";
  const selected =
    active && active !== "methodology"
      ? rows.find(({ label }) => label === active.label)
      : undefined;
  const positive = sorted.filter(({ value }) => value != null && value > 0).length;
  let offset = 0;
  const segments = sorted.map(({ row, value }, index) => {
    const share = shares[index] ?? null;
    const segment = {
      row,
      value,
      share,
      offset,
      color: donutColor(Math.min(index, Math.max(positive - 1, 0)), positive),
      shareLabel: share == null ? "" : `${formatNumber(share, { maximumSignificantDigits: 4 })}%`,
    };
    offset += share ?? 0;
    return segment;
  });
  const highlight = segments.find(({ row }) => row.label === hovered);
  const term = search?.trim().toLowerCase() ?? "";
  const matches = (row: Breakdown) => row.label.toLowerCase().includes(term);
  const visible = segments.filter(({ row }) => matches(row));
  const columns = Array.from({ length: Math.ceil(visible.length / 8) }, (_, i) =>
    visible.slice(i * 8, (i + 1) * 8),
  );
  return (
    <div>
      {(!drawable || partial || market || returnedSubtotal) && (
        <p className="mb-4 text-sm text-muted-foreground">
          {!rows.length
            ? "No categories were supplied."
            : !drawable
              ? comparisonOnly
                ? "Utilization percentages describe individual resources and cannot be summed into shares."
                : "A proportional chart requires non-negative values and a positive total."
              : partial
                ? "Shares use the available subtotal. Some categories have unavailable values."
                : null}
          {returnedSubtotal && " Tool shares use the provider’s returned subtotal."}
          {market &&
            " Market-based values reflect covered activity. Coverage can vary by category."}
        </p>
      )}
      {term && (
        <p className="mb-2 text-xs text-muted-foreground">
          {visible.length
            ? drawable
              ? "Search highlights matching categories. Shares use the complete displayed total or subtotal."
              : null
            : "No matching entities."}
        </p>
      )}
      <div className="flex min-w-0 flex-wrap items-start justify-center gap-5">
        {drawable && (
          <div className="relative aspect-square w-full min-w-0 max-w-[26rem] grow basis-[22rem]">
            <svg viewBox="0 0 200 200" aria-label="Category share donut" className="size-full">
              <circle
                cx="100"
                cy="100"
                r="82"
                fill="none"
                className="stroke-muted"
                strokeWidth="25"
              />
              {segments.map(
                ({ row, value, share, offset, color, shareLabel }) =>
                  share != null &&
                  share > 0 && (
                    <circle
                      key={row.label}
                      data-category={row.label}
                      role="button"
                      tabIndex={matches(row) ? 0 : -1}
                      aria-hidden={matches(row) ? undefined : true}
                      aria-label={`${row.label}, ${amount(value, unit)}, ${shareLabel}`}
                      cx="100"
                      cy="100"
                      r="82"
                      fill="none"
                      stroke={color}
                      strokeWidth={highlight?.row.label === row.label ? 31 : 25}
                      pathLength="100"
                      strokeDasharray={`${share} 100`}
                      strokeDashoffset={-offset}
                      transform="rotate(-90 100 100)"
                      className={
                        matches(row)
                          ? "cursor-pointer focus-visible:opacity-75"
                          : "pointer-events-none opacity-25"
                      }
                      onPointerEnter={() => setHovered(row.label)}
                      onPointerLeave={() => setHovered(null)}
                      onFocus={() => setHovered(row.label)}
                      onBlur={() => setHovered(null)}
                      onClick={() => setActive({ label: row.label })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setActive({ label: row.label });
                        }
                      }}
                    >
                      <title>
                        {row.label} · {amount(value, unit)} · {shareLabel}
                      </title>
                    </circle>
                  ),
              )}
            </svg>
            <div className="pointer-events-none absolute inset-[22%] grid content-center text-center">
              <p className="line-clamp-2 break-words text-xs text-muted-foreground">
                {highlight?.row.label ??
                  (partial || market || returnedSubtotal ? "Supplied subtotal" : "Total")}
              </p>
              <p className="num break-words text-base font-semibold sm:text-xl">
                {formatNumber(highlight ? highlight.value : total, {
                  maximumFractionDigits: metric === "costChf" ? 2 : 3,
                })}
              </p>
              <p className="text-xs text-muted-foreground">
                {unit}
                {highlight?.shareLabel && ` · ${highlight.shareLabel}`}
              </p>
            </div>
          </div>
        )}
        {columns.length > 0 && (
          <div
            role="group"
            aria-label="Categories and shares"
            className="grid min-w-0 grow grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] gap-x-3 gap-y-2"
            style={{ flexBasis: `${columns.length * 9 + (columns.length - 1) * 0.75}rem` }}
          >
            {columns.map((column, index) => (
              <ul key={index} aria-label={`Categories column ${index + 1}`} className="min-w-0">
                {column.map(({ row, value, color, shareLabel }) => (
                  <li key={row.label}>
                    <button
                      type="button"
                      onClick={() => setActive({ label: row.label })}
                      onPointerEnter={() => setHovered(row.label)}
                      onPointerLeave={() => setHovered(null)}
                      onFocus={() => setHovered(row.label)}
                      onBlur={() => setHovered(null)}
                      data-highlighted={hovered === row.label}
                      className="grid w-full grid-cols-[0.75rem_minmax(0,1fr)] items-baseline gap-x-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-accent data-[highlighted=true]:bg-primary/15"
                    >
                      <span
                        data-category-color={row.label}
                        aria-hidden
                        className="size-2.5 rounded-full"
                        style={value != null && drawable ? { backgroundColor: color } : undefined}
                      />
                      <span className="min-w-0 break-words font-medium">{row.label}</span>
                      <span className="num col-start-2 break-words text-muted-foreground">
                        {amount(value, unit)}
                        {drawable && shareLabel && ` · ${shareLabel}`}
                      </span>
                      {market && row.marketCoverage && (
                        <span className="col-start-2 text-[11px] text-muted-foreground">
                          {marketCoverageLabel(row.marketCoverage)}
                        </span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        )}
      </div>
      <AnalyticalInspector
        title={selected?.label ?? "Spending attribution"}
        trigger={null}
        open={active != null}
        onOpenChange={(open) => {
          if (!open) setActive(null);
        }}
        contentKey={metric}
      >
        {selected &&
          (entityDetails ? (
            entityDetails(selected)
          ) : (
            <DetailBlock title="Annual attributed values">
              {metrics.map(([key, label, unit]) => (
                <p key={key} className={key === metric ? "font-semibold" : undefined}>
                  {label} · {amount(selected[key], unit)}
                </p>
              ))}
            </DetailBlock>
          ))}
        <DetailBlock title="Attribution methodology">{rule}</DetailBlock>
        {selected?.marketCoverage && (
          <>
            <DetailBlock title="Market-based coverage">
              <p>{marketCoverageLabel(selected.marketCoverage)}</p>
              <p>{selected.marketCoverage.missingInputs.join(" · ")}</p>
              <p>{selected.marketCoverage.assumptions.join(" · ")}</p>
            </DetailBlock>
            <EvidenceSources sources={selected.marketCoverage.sources} />
          </>
        )}
      </AnalyticalInspector>
    </div>
  );
}
