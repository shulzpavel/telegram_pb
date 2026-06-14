import type { ScopeBoardRecord, ScopeBoardSnapshot, ScopeSectionConfig, ScopeSectionKind } from "../api/cmsClient";

export function createSectionId(): string {
  return `sec-${Math.random().toString(36).slice(2, 8)}`;
}

export function defaultScopeSections(): ScopeSectionConfig[] {
  return [
    { id: "plan", name: "Plan", jql: "", kind: "planned", order: 0 },
    { id: "unplan", name: "Unplan", jql: "", kind: "unplanned", order: 1 },
  ];
}

export function normalizeScopeSections(
  sections: ScopeSectionConfig[] | null | undefined,
  legacy?: { plan_jql?: string; unplan_jql?: string }
): ScopeSectionConfig[] {
  if (sections && sections.length > 0) {
    return [...sections]
      .sort((left, right) => left.order - right.order || left.name.localeCompare(right.name))
      .map((section, index) => ({
        id: section.id || createSectionId(),
        name: section.name.trim() || "Секция",
        jql: section.jql.trim(),
        kind: section.kind === "unplanned" ? "unplanned" : "planned",
        order: index,
      }));
  }

  const plan = legacy?.plan_jql?.trim() || "";
  const unplan = legacy?.unplan_jql?.trim() || "";
  if (plan || unplan) {
    const result: ScopeSectionConfig[] = [];
    if (plan) result.push({ id: "plan", name: "Plan", jql: plan, kind: "planned", order: 0 });
    if (unplan) result.push({ id: "unplan", name: "Unplan", jql: unplan, kind: "unplanned", order: result.length });
    return result;
  }
  return defaultScopeSections();
}

export function resolveScopeSections(board: Pick<ScopeBoardRecord, "scope_sections" | "plan_jql" | "unplan_jql">): ScopeSectionConfig[] {
  return normalizeScopeSections(board.scope_sections, {
    plan_jql: board.plan_jql,
    unplan_jql: board.unplan_jql,
  });
}

export function resolveSnapshotSections(snapshot: ScopeBoardSnapshot): Array<{
  id: string;
  name: string;
  kind: ScopeSectionKind;
  order: number;
  issues: ScopeBoardSnapshot["plan_issues"];
}> {
  if (snapshot.sections && snapshot.sections.length > 0) {
    return [...snapshot.sections].sort((left, right) => left.order - right.order || left.name.localeCompare(right.name));
  }
  return normalizeScopeSections(null, {
    plan_jql: snapshot.plan_issues.length ? "legacy-plan" : "",
    unplan_jql: snapshot.unplan_issues.length ? "legacy-unplan" : "",
  }).flatMap((section) => {
    if (section.id === "plan") {
      return [{ ...section, issues: snapshot.plan_issues }];
    }
    if (section.id === "unplan") {
      return [{ ...section, issues: snapshot.unplan_issues }];
    }
    return [];
  });
}

export function createScopeSection(partial?: Partial<ScopeSectionConfig>): ScopeSectionConfig {
  return {
    id: partial?.id || createSectionId(),
    name: partial?.name?.trim() || "Новая секция",
    jql: partial?.jql?.trim() || "",
    kind: partial?.kind === "unplanned" ? "unplanned" : "planned",
    order: partial?.order ?? 0,
  };
}

export function reorderScopeSections(sections: ScopeSectionConfig[], fromIndex: number, toIndex: number): ScopeSectionConfig[] {
  if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= sections.length || toIndex >= sections.length) {
    return normalizeScopeSectionOrder(sections);
  }
  const next = [...sections];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return normalizeScopeSectionOrder(next);
}

export function normalizeScopeSectionOrder(sections: ScopeSectionConfig[]): ScopeSectionConfig[] {
  return sections.map((section, index) => ({ ...section, order: index }));
}

export function sectionKindLabel(kind: ScopeSectionKind): string {
  return kind === "planned" ? "Плановая" : "Внеплановая";
}

export function validateScopeSections(sections: ScopeSectionConfig[]): string | null {
  if (sections.length === 0) {
    return "Добавьте хотя бы одну JQL-секцию.";
  }
  for (const section of sections) {
    if (!section.name.trim()) {
      return "У каждой секции должно быть название.";
    }
    if (!section.jql.trim()) {
      return `Заполните JQL для секции «${section.name.trim() || "без названия"}».`;
    }
  }
  return null;
}
