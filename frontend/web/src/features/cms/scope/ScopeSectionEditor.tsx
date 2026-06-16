import { Badge, Button, DropdownField, TextField, TextareaField } from "../../../design-system";
import type { ScopeSectionConfig, ScopeSectionKind } from "../api/cmsClient";
import {
  createScopeSection,
  normalizeScopeSectionOrder,
  reorderScopeSections,
  sectionKindLabel,
} from "./scopeSectionHelpers";

export function ScopeSectionEditor({
  sections,
  disabled = false,
  onChange,
}: {
  sections: ScopeSectionConfig[];
  disabled?: boolean;
  onChange: (sections: ScopeSectionConfig[]) => void;
}) {
  function updateSection(index: number, patch: Partial<ScopeSectionConfig>) {
    onChange(
      normalizeScopeSectionOrder(
        sections.map((section, sectionIndex) => (sectionIndex === index ? { ...section, ...patch } : section))
      )
    );
  }

  function removeSection(index: number) {
    if (sections.length <= 1) return;
    onChange(normalizeScopeSectionOrder(sections.filter((_, sectionIndex) => sectionIndex !== index)));
  }

  function moveSection(index: number, direction: -1 | 1) {
    onChange(reorderScopeSections(sections, index, index + direction));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-ink">JQL-секции отчёта</h3>
          <p className="text-xs text-ink3">Добавляйте, переименовывайте и удаляйте секции. Тип влияет на расчёт буфера.</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={disabled}
          onClick={() => onChange(normalizeScopeSectionOrder([...sections, createScopeSection({ order: sections.length })]))}
        >
          Добавить секцию
        </Button>
      </div>

      {sections.map((section, index) => (
        <div key={section.id} className="rounded-lg border border-line bg-bg p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone={section.kind === "planned" ? "info" : "warning"}>{sectionKindLabel(section.kind)}</Badge>
              <span className="text-xs text-ink3">#{index + 1}</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button size="sm" variant="ghost" disabled={disabled || index === 0} onClick={() => moveSection(index, -1)}>
                ↑
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={disabled || index === sections.length - 1}
                onClick={() => moveSection(index, 1)}
              >
                ↓
              </Button>
              <Button size="sm" variant="ghost" disabled={disabled || sections.length <= 1} onClick={() => removeSection(index)}>
                Удалить
              </Button>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <TextField
              label="Название секции"
              value={section.name}
              disabled={disabled}
              onChange={(event) => updateSection(index, { name: event.target.value })}
            />
            <DropdownField
              label="Тип для буфера"
              value={section.kind}
              options={[
                { value: "planned", label: "Плановая" },
                { value: "unplanned", label: "Внеплановая" },
              ]}
              disabled={disabled}
              onChange={(value) => updateSection(index, { kind: value as ScopeSectionKind })}
            />
          </div>
          <TextareaField
            className="mt-3"
            label="JQL"
            rows={3}
            value={section.jql}
            disabled={disabled}
            onChange={(event) => updateSection(index, { jql: event.target.value })}
          />
        </div>
      ))}
    </div>
  );
}
