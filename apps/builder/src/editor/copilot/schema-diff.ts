import type { PageSchema } from "@mpp/schema";

export type PageDiffEntry =
  | { kind: "title_changed"; before: string; after: string }
  | { kind: "component_added"; componentId: string; componentType: string; index: number }
  | { kind: "component_removed"; componentId: string; componentType: string; index: number }
  | { kind: "component_moved"; componentId: string; componentType: string; from: number; to: number }
  | { kind: "prop_updated"; componentId: string; componentType: string; propKey: string; before: unknown; after: unknown };

function equal(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (!a || !b || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a as object).sort();
  const keysB = Object.keys(b as object).sort();
  return keysA.length === keysB.length && keysA.every((key, index) => key === keysB[index] && equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

export function diffPageSchemas(before: PageSchema, after: PageSchema): PageDiffEntry[] {
  const changes: PageDiffEntry[] = [];
  if (before.title !== after.title) changes.push({ kind: "title_changed", before: before.title, after: after.title });
  const oldById = new Map(before.components.map((component, index) => [component.id, { component, index }]));
  const newById = new Map(after.components.map((component, index) => [component.id, { component, index }]));
  for (const [id, old] of oldById) {
    const current = newById.get(id);
    if (!current || current.component.type !== old.component.type) { changes.push({ kind: "component_removed", componentId: id, componentType: old.component.type, index: old.index }); continue; }
    const keys = new Set([...Object.keys(old.component.props), ...Object.keys(current.component.props)]);
    for (const propKey of keys) if (!equal(old.component.props[propKey], current.component.props[propKey])) changes.push({ kind: "prop_updated", componentId: id, componentType: old.component.type, propKey, before: old.component.props[propKey], after: current.component.props[propKey] });
  }
  for (const [id, current] of newById) { const old = oldById.get(id); if (!old || old.component.type !== current.component.type) changes.push({ kind: "component_added", componentId: id, componentType: current.component.type, index: current.index }); }
  const oldSurvivors = before.components.filter((item) => newById.has(item.id) && oldById.get(item.id)?.component.type === newById.get(item.id)?.component.type).map((item) => item.id);
  const newSurvivors = after.components.filter((item) => oldById.has(item.id) && oldById.get(item.id)?.component.type === newById.get(item.id)?.component.type).map((item) => item.id);
  const oldPosition = new Map(oldSurvivors.map((id, index) => [id, index]));
  const newPosition = new Map(newSurvivors.map((id, index) => [id, index]));
  for (const id of oldSurvivors) { const from = oldPosition.get(id)!; const to = newPosition.get(id)!; if (from !== to) changes.push({ kind: "component_moved", componentId: id, componentType: newById.get(id)!.component.type, from, to }); }
  return changes;
}
