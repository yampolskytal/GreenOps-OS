import type { ReactNode } from 'react';
export interface ContributionDay { date: string; count: number | null; colorCount?: number | null; detail?: string }
export default function ContributionSkyline(props: { data: ContributionDay[]; month?: string; showToggle?: boolean; heightScale?: number; view?: '2d'|'3d'; onViewChange?: (v: '2d'|'3d') => void; palette?: string[]; title?: ReactNode; unit?: string; unitPlural?: string; footer?: ReactNode; showStats?: boolean; showLegend?: boolean; weekStart?: 0|1; onCellClick?: (day: ContributionDay) => void }): ReactNode;
