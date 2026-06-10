import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import AiSummaryView from "./AiSummaryView";

const fullSummary = {
  description: "Добавить фильтр по статусу в список заказов.",
  methods: ["Проверить API контракт", "Учесть пагинацию"],
  complexity: "Средняя: затрагивает backend и UI.",
  sp_dev: 5,
  sp_test: 3,
  sp_final: 5,
  scale_label: "SP = max(SP dev, SP test)",
  assumptions: ["Нет миграции данных", "Дизайн уже согласован"],
};

describe("AiSummaryView", () => {
  it("renders the full structured summary used by cockpit and voters", () => {
    const markup = renderToStaticMarkup(
      <AiSummaryView summary={fullSummary} helperText="для оценки" />,
    );

    expect(markup).toContain(fullSummary.description);
    expect(markup).toContain("Проверить API контракт");
    expect(markup).toContain(fullSummary.complexity);
    expect(markup).toContain("SP dev");
    expect(markup).toContain("SP test");
    expect(markup).toContain("SP final");
    expect(markup).toContain("Нет миграции данных");
    expect(markup).toContain("для оценки");
  });
});
