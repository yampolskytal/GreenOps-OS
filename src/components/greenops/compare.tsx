import { useState } from "react";
import { useBreakdowns, useResources } from "@/lib/queries";
import { useApp } from "@/lib/store";
import { chf, kg, kwh } from "@/lib/format";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Q } from "./ui";
import { LeaderboardBars } from "./leaderboard-bars";
import { ResourceDetails } from "./resource-details";
type Category = "byDepartment" | "byProvider" | "byTool" | "byService" | "servers";
export function ComparisonBoard({ finance = false }: { finance?: boolean }) {
  const { s } = useApp();
  const [category, setCategory] = useState<Category>(
    !finance && s.role === "it" ? "servers" : "byDepartment",
  );
  const [metric, setMetric] = useState("costChf");
  const b = useBreakdowns();
  const rs = useResources();
  const operational = category === "servers";
  const metrics = operational
    ? [
        ["runtimeH30d", "Runtime (h)"],
        ["cpuAvgPct", "CPU utilization (%)"],
        ["gpuAvgPct", "GPU utilization (%)"],
        ["idleCostChfYear", "Estimated idle cost (CHF)"],
      ]
    : [
        ["costChf", "Annual cost (CHF)"],
        ["co2Kg", "CO₂ (kg)"],
        ["energyKwh", "Energy (kWh)"],
      ];
  const effective = metrics.some((m) => m[0] === metric)
    ? metric
    : operational
      ? "runtimeH30d"
      : "costChf";
  const fmt =
    effective.includes("Cost") || effective === "costChf"
      ? chf
      : effective === "co2Kg"
        ? kg
        : effective === "energyKwh"
          ? kwh
          : (n: number) => `${n.toFixed(1)}${effective.endsWith("Pct") ? "%" : " h"}`;
  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-3">
        <Select value={category} onValueChange={(v) => setCategory(v as Category)}>
          <SelectTrigger aria-label="Comparison category" className="w-44">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {[
              ["byDepartment", "Departments"],
              ["byProvider", "Providers"],
              ["byTool", "Tools"],
              ["byService", "Service categories"],
              ...(!finance ? [["servers", "Servers"]] : []),
            ].map(([v, l]) => (
              <SelectItem key={v} value={v ?? ""}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={effective} onValueChange={setMetric}>
          <SelectTrigger aria-label="Ranking metric" className="w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {metrics.map(([v, l]) => (
              <SelectItem key={v} value={v ?? ""}>
                {l}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {operational ? (
        <Q q={rs}>
          {(data) => (
            <LeaderboardBars
              label="Last 30 days · source-reported utilization"
              format={fmt}
              items={data.map((r) => ({
                id: r.id,
                label: r.name,
                value:
                  effective === "cpuAvgPct"
                    ? (r.cpuAvgPct ?? null)
                    : effective === "gpuAvgPct"
                      ? (r.gpuAvgPct ?? null)
                      : effective === "idleCostChfYear"
                        ? r.idleCostChfYear
                        : r.runtimeH30d,
                content: <ResourceDetails resource={r} />,
              }))}
            />
          )}
        </Q>
      ) : (
        <Q q={b}>
          {(data) => (
            <LeaderboardBars
              label={data.allocationRule}
              format={fmt}
              items={data[category].map((d) => ({
                id: d.label,
                label: d.label,
                value:
                  effective === "co2Kg"
                    ? d.co2Kg
                    : effective === "energyKwh"
                      ? d.energyKwh
                      : d.costChf,
                detail: `Annual cost: ${chf(d.costChf)} · CO₂: ${kg(d.co2Kg)} · energy: ${kwh(d.energyKwh)}. ${data.allocationRule}`,
              }))}
            />
          )}
        </Q>
      )}
    </div>
  );
}
