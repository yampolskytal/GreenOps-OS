import { useOverview, useSimulation } from "@/lib/queries";
import { useDisplayedPlan } from "@/lib/store";
import { HistoricalPerformance, type HistoricalSelection } from "./historical-performance";
import { Q } from "./ui";

export function useDashboardPerformanceData() {
  const overview = useOverview(true);
  const simulation = useSimulation();
  const plan = useDisplayedPlan();
  return { overview, simulation, plan };
}

type PerformanceProps = {
  selection?: HistoricalSelection | undefined;
  onSelectionChange?: (selection: HistoricalSelection) => void;
};

export function DashboardPerformance(props: PerformanceProps) {
  const data = useDashboardPerformanceData();
  return <DashboardPerformanceContent {...data} {...props} />;
}

export function DashboardPerformanceContent({
  overview,
  simulation,
  plan,
  selection,
  onSelectionChange,
}: ReturnType<typeof useDashboardPerformanceData> & PerformanceProps) {
  return (
    <div id="monthly">
      <Q q={overview}>
        {(data) => (
          <HistoricalPerformance
            overview={data}
            initialSelection={selection}
            {...(onSelectionChange ? { onSelectionChange } : {})}
            emissionsProjection={{
              result: simulation.data,
              pending: simulation.isFetching,
              error: simulation.isError,
              label: plan.label,
            }}
          />
        )}
      </Q>
    </div>
  );
}
