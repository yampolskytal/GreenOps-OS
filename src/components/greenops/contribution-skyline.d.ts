import type { ReactNode } from "react";
import type { buildFootprintGrid } from "@/lib/calendar-model";
export interface ContributionDay {
  date: string;
  count: number | null;
  colorCount?: number | null;
  detail?: string;
  partial?: boolean;
}
export default function ContributionSkyline(props: {
  data: ContributionDay[];
  footprintGrid?: ReturnType<typeof buildFootprintGrid>;
  month?: string;
  showToggle?: boolean;
  heightScale?: number;
  view?: "2d" | "3d";
  onViewChange?: (v: "2d" | "3d") => void;
  palette?: string[];
  title?: ReactNode;
  unit?: string;
  unitPlural?: string;
  footer?: ReactNode;
  showStats?: boolean;
  showLegend?: boolean;
  weekStart?: 0 | 1;
  selectedDate?: string | null;
  onCellClick?: (day: ContributionDay) => void;
}): ReactNode;
