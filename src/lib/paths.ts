import type { Measure, Priority, SimulationResult } from "./api/types";
import { TARGETS } from "./optimizer";
import { canSelectMeasure } from "./planning";

export type PathSlot = "a" | "b" | "c";
export const PATH_SLOTS: PathSlot[] = ["a", "b", "c"];
export interface SavedPath {
  id: string;
  name: string;
  measureIds: string[];
  budgetChf: number;
  priority: Priority;
  /** Stable color identity; survives renames. */
  slot?: PathSlot;
}
export const MAX_PATHS = 3;
export const pathSlot = (paths: SavedPath[], path: SavedPath): PathSlot =>
  path.slot ?? PATH_SLOTS[Math.max(0, paths.indexOf(path))] ?? "a";
/** Assigns missing slots without moving existing ones and drops duplicate ids/measures. */
export function normalizePaths(paths: SavedPath[]): SavedPath[] {
  const seen = new Set<string>();
  const unique = paths.filter((p) => p && !seen.has(p.id) && seen.add(p.id)).slice(0, MAX_PATHS);
  const used = new Set(unique.map((p) => p.slot).filter(Boolean));
  return unique.map((p) => {
    let slot = p.slot && PATH_SLOTS.includes(p.slot) ? p.slot : undefined;
    if (!slot) {
      slot = PATH_SLOTS.find((s) => !used.has(s)) ?? "a";
      used.add(slot);
    }
    return { ...p, slot, measureIds: [...new Set(p.measureIds ?? [])] };
  });
}
const sameName = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
export function findPathByName(paths: SavedPath[], name: string) {
  return paths.find((p) => sameName(p.name, name));
}
export function createPath(paths: SavedPath[], path: SavedPath): SavedPath[] {
  if (!path.name.trim()) throw new Error("Give your Path a name.");
  if (findPathByName(paths, path.name)) throw new Error("A Path with this name already exists.");
  if (paths.length >= MAX_PATHS)
    throw new Error("You can save up to three Paths. Edit or replace an existing one.");
  const used = new Set(normalizePaths(paths).map((p) => p.slot));
  const slot = PATH_SLOTS.find((s) => !used.has(s)) ?? "a";
  return [
    ...normalizePaths(paths),
    { ...path, slot, name: path.name.trim(), measureIds: [...new Set(path.measureIds)] },
  ];
}
/** Type-a-name-and-save: selects an existing Path with that name, otherwise creates it. */
export function ensurePath(
  paths: SavedPath[],
  name: string,
  defaults: Omit<SavedPath, "id" | "name" | "measureIds">,
  id: string,
): { paths: SavedPath[]; id: string; created: boolean } {
  const existing = findPathByName(paths, name);
  if (existing) return { paths, id: existing.id, created: false };
  return {
    paths: createPath(paths, { ...defaults, id, name, measureIds: [] }),
    id,
    created: true,
  };
}
export function setPathMembership(paths: SavedPath[], measureId: string, pathIds: string[]) {
  return paths.map((p) => ({
    ...p,
    measureIds: pathIds.includes(p.id)
      ? [...new Set([...p.measureIds, measureId])]
      : p.measureIds.filter((id) => id !== measureId),
  }));
}
/** Bulk: adds every measure to each chosen Path; other Paths stay untouched. */
export function addMeasuresToPaths(paths: SavedPath[], measureIds: string[], pathIds: string[]) {
  return paths.map((p) =>
    pathIds.includes(p.id) ? { ...p, measureIds: [...new Set([...p.measureIds, ...measureIds])] } : p,
  );
}
export function removeFromPath(paths: SavedPath[], pathId: string, measureId: string) {
  return paths.map((p) =>
    p.id === pathId ? { ...p, measureIds: p.measureIds.filter((id) => id !== measureId) } : p,
  );
}
export function replacePath(paths: SavedPath[], pathId: string, patch: Partial<SavedPath>) {
  return paths.map((p) => (p.id === pathId ? { ...p, ...patch, id: p.id, ...(p.slot ? { slot: p.slot } : {}) } : p));
}

export interface PathAddition {
  measure: Measure;
  reason: string;
}
/**
 * Ranks eligible measures for one Path's unmet criteria using only per-measure supplied values.
 * It never claims the Path becomes feasible — that requires simulation.
 */
export function recommendAdditions(
  measures: Measure[],
  path: SavedPath,
  result: SimulationResult | null,
  limit = 4,
): PathAddition[] {
  const effortLeft = result ? TARGETS.maxPersonDays - result.effortDays : TARGETS.maxPersonDays;
  const co2Gap = result ? TARGETS.co2Pct - result.co2ReductionPct : TARGETS.co2Pct;
  const costGap = result ? TARGETS.costPct - result.costReductionPct : TARGETS.costPct;
  const candidates = measures.filter(
    (m) =>
      !path.measureIds.includes(m.id) &&
      canSelectMeasure(m) &&
      m.risk.level !== "blocked" &&
      m.effortPersonDays <= Math.max(0, effortLeft),
  );
  const weightCo2 = co2Gap > 0 ? co2Gap : 0;
  const weightCost = costGap > 0 ? costGap : 0;
  const score = (m: Measure) => {
    const e = Math.max(0.5, m.effortPersonDays);
    const total = weightCo2 + weightCost || 1;
    return ((weightCo2 / total) * m.savingsCo2KgLocation * 30 + (weightCost / total) * m.savingsChf) / e;
  };
  return candidates
    .sort((a, b) => score(b) - score(a))
    .slice(0, limit)
    .map((m) => ({
      measure: m,
      reason:
        co2Gap > 0 && costGap > 0
          ? "Could close part of the remaining CO₂ and cost gaps within the available effort."
          : co2Gap > 0
            ? "Could close part of the remaining CO₂ reduction gap within the available effort."
            : costGap > 0
              ? "Could close part of the remaining cost reduction gap within the available effort."
              : "Adds further savings while staying within the available effort.",
    }));
}
export function previewDifference(next: string[], committed: string[]) {
  return {
    added: next.filter((id) => !committed.includes(id)).length,
    removed: committed.filter((id) => !next.includes(id)).length,
  };
}
