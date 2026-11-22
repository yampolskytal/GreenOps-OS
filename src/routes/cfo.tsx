import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Coins, PiggyBank, Hammer, ArrowRight } from "lucide-react";
import { AppShell } from "@/components/greenops/shell";
import { CalcInfo, Q } from "@/components/greenops/ui";
import { DetailBlock, DetailDrawer, EvidenceInfoButton } from "@/components/greenops/details";
import { DashboardSections } from "@/components/greenops/dashboard-sections";
import {
  DashboardPerformanceContent,
  useDashboardPerformanceData,
} from "@/components/greenops/dashboard-performance";
import { SpendingDonut, type SpendingSelection } from "@/components/greenops/spending-donut";
import type { HistoricalSelection } from "@/components/greenops/historical-performance";
import { ForecastChart } from "@/components/greenops/forecast-chart";
import { Button } from "@/components/ui/button";
import { useForecast } from "@/lib/queries";
import { PlanningProjection, StartingPlanNotice } from "@/components/greenops/starting-plan-notice";
import { chf, formatEvidenceText, formatNumber } from "@/lib/format";
import type { MonthlyObservation } from "@/lib/api/types";
import { seo } from "@/lib/seo";

export const Route = createFileRoute("/cfo")({
  head: () =>
    seo(
      "Finance Dashboard — GreenOps OS",
      "Digital spending, projected savings and implementation economics.",
    ),
  component: Cfo,
});

function sectionForHash(hash: string) {
  if (hash === "monthly") return "performance";
  if (hash === "spending" || hash === "compare") return "spending";
  return "overview";
}

function Cfo() {
  const data = useDashboardPerformanceData();
  const [spending, setSpending] = useState<SpendingSelection>();
  const [historical, setHistorical] = useState<HistoricalSelection>();
  return (
    <AppShell
      title="Finance Dashboard"
      subtitle="Historical digital spending, projected savings and implementation costs."
      showStartingPlan={false}
    >
      <DashboardSections
        label="Finance dashboard"
        sectionForHash={sectionForHash}
        sections={[
          {
            id: "overview",
            label: "Overview",
            content: <FinanceOverview {...data} />,
          },
          {
            id: "spending",
            label: "Spending Drivers",
            content: <SpendingDonut initial={spending} onSelectionChange={setSpending} />,
          },
          {
            id: "performance",
            label: "Performance",
            content: (
              <DashboardPerformanceContent
                {...data}
                selection={historical}
                onSelectionChange={setHistorical}
              />
            ),
          },
        ]}
      />
    </AppShell>
  );
}

function FinanceOverview({
  overview,
  simulation,
  plan,
}: ReturnType<typeof useDashboardPerformanceData>) {
  const baseline = overview.data;
  const result = plan.ready ? simulation.data : undefined;
  const kpis = [
    {
      label: "Annual digital spending",
      value: baseline?.cost.value.mid,
      description: baseline?.baselinePeriod ?? "Reporting period unavailable",
      Icon: Coins,
      info: baseline ? <CalcInfo calc={baseline.cost.calc} /> : null,
    },
    {
      label: "Potential annual savings",
      value: result?.savingsChf,
      description: `Projected · ${plan.label}`,
      Icon: PiggyBank,
      info: result ? projectionInfo("Potential annual savings") : null,
    },
    {
      label: "Implementation budget used",
      value: result?.effortChf,
      description: plan.ready ? `Plan budget · ${chf(plan.budgetChf)}` : "Awaiting recommendation",
      Icon: Hammer,
      info: result ? projectionInfo("Implementation budget used") : null,
    },
  ];
  function projectionInfo(label: string) {
    if (!result) return null;
    return (
      <DetailDrawer title={label} trigger={<EvidenceInfoButton description={label} />}>
        <DetailBlock title={plan.label}>
          <p>Projected annual savings · {chf(result.savingsChf)}</p>
          <p>Implementation expenditure · {chf(result.effortChf)}</p>
          <p>Modeled effort · {formatNumber(result.effortDays)} person-days</p>
        </DetailBlock>
        <DetailBlock title="Calculation notes">
          {result.reasons.length ? (
            result.reasons.map((reason) => <p key={reason}>{formatEvidenceText(reason)}</p>)
          ) : (
            <p>Savings are projected for the selected strategy.</p>
          )}
          {result.excluded.map(({ id, reason }) => (
            <p key={id}>
              {id} · {formatEvidenceText(reason)}
            </p>
          ))}
        </DetailBlock>
      </DetailDrawer>
    );
  }
  return (
    <div className="@container space-y-5">
      <StartingPlanNotice compact />
      <dl
        aria-label="Financial indicators"
        className="grid grid-cols-1 gap-x-6 gap-y-1 @2xl:grid-cols-3"
      >
        {kpis.map(({ label, value, description, Icon, info }) => (
          <div key={label} className="row-span-3 grid min-w-0 grid-rows-subgrid border-b py-2">
            <dt className="grid min-h-9 grid-cols-[1rem_minmax(0,1fr)_2.25rem] items-center gap-2 text-sm">
              <Icon aria-hidden className="size-4 text-muted-foreground" />
              <span>{label}</span>
              <span>{info}</span>
            </dt>
            <dd className="num break-words text-2xl font-semibold">{chf(value)}</dd>
            <dd className="pb-1 text-xs text-muted-foreground">{description}</dd>
          </div>
        ))}
      </dl>
      {overview.isError && <Q q={overview}>{() => null}</Q>}
      <section className="max-w-3xl space-y-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-semibold">Budget &amp; economics</h2>
            <p className="text-xs text-muted-foreground">{plan.label}</p>
          </div>
          <Button asChild size="sm">
            <Link to="/studio">
              Open Optimization Studio <ArrowRight />
            </Link>
          </Button>
        </header>
        <PlanningProjection>
          <Q q={simulation}>
            {(r) => (
              <dl className="grid grid-cols-[minmax(0,1fr)_auto] text-sm">
                {[
                  ["Implementation expenditure", chf(r.effortChf)],
                  ["Projected annual savings", chf(r.savingsChf)],
                  ["Remaining implementation budget", chf(plan.budgetChf - r.effortChf)],
                  [
                    "Payback period",
                    r.paybackMonths == null
                      ? "Unavailable"
                      : `${formatNumber(r.paybackMonths, { maximumFractionDigits: 1 })} months`,
                  ],
                  ["Selected measures", formatNumber(plan.measureIds.length)],
                ].map(([label, value]) => (
                  <div
                    key={label}
                    className="col-span-2 grid grid-cols-subgrid gap-x-3 border-b py-2"
                  >
                    <dt className="text-muted-foreground">{label}</dt>
                    <dd className="num text-right">{value}</dd>
                  </div>
                ))}
              </dl>
            )}
          </Q>
        </PlanningProjection>
      </section>
      <section className="border-t pt-3">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Financial outlook</h2>
          <div className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="link">
              <Link to="/forecast">
                Full forecasts <ArrowRight />
              </Link>
            </Button>
          </div>
        </header>
        <div id="finance-outlook">
          {baseline?.forecastSupport?.some(
            (item) => item.metric === "cost" && item.horizons.includes(3),
          ) ? (
            <FinancialOutlook history={baseline.monthly} planLabel={plan.label} />
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Three-year cost projections are unavailable.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function FinancialOutlook({
  history,
  planLabel,
}: {
  history: MonthlyObservation[];
  planLabel: string;
}) {
  const forecast = useForecast("cost", 3);
  return (
    <Q q={forecast}>
      {(f) => (
        <ForecastChart f={f} format={chf} height={260} history={history} planLabel={planLabel} />
      )}
    </Q>
  );
}
