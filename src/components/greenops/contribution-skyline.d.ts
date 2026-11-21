import type { ReactNode } from 'react';
export interface ContributionDay { date: string; count: number; colorCount?: number; detail?: string }
export default function ContributionSkyline(props: { data: ContributionDay[]; view?: '2d'|'3d'; onViewChange?: (v: '2d'|'3d') => void; palette?: string[]; title?: ReactNode; unit?: string; unitPlural?: string; footer?: ReactNode; showStats?: boolean; showLegend?: boolean; weekStart?: 0|1; onCellClick?: (day: ContributionDay) => void }): ReactNode;
