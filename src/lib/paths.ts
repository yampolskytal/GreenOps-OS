import type { Priority } from "./api/types";

export interface SavedPath {
  id: string;
  name: string;
  measureIds: string[];
  budgetChf: number;
  priority: Priority;
}
export const MAX_PATHS = 3;
export function createPath(paths: SavedPath[], path: SavedPath): SavedPath[] {
  if (paths.length >= MAX_PATHS) throw new Error("You can save up to three Paths.");
  if (!path.name.trim()) throw new Error("Give your Path a name.");
  return [...paths, { ...path, name: path.name.trim(), measureIds: [...new Set(path.measureIds)] }];
}
export function setPathMembership(paths: SavedPath[], measureId: string, pathIds: string[]) {
  return paths.map((p) => ({
    ...p,
    measureIds: pathIds.includes(p.id)
      ? [...new Set([...p.measureIds, measureId])]
      : p.measureIds.filter((id) => id !== measureId),
  }));
}
export function previewDifference(preview: string[], committed: string[]) {
  return {
    added: preview.filter((id) => !committed.includes(id)).length,
    removed: committed.filter((id) => !preview.includes(id)).length,
  };
}
