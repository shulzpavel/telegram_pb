import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { SessionTabsSegment } from "./SessionTabsBar";

describe("SessionTabsSegment", () => {
  it("renders cockpit and report tab links", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/cms/sessions/42/cockpit"]}>
        <SessionTabsSegment chatId={42} />
      </MemoryRouter>,
    );
    expect(markup).toContain('href="/cms/sessions/42/cockpit"');
    expect(markup).toContain('href="/cms/sessions/42/report"');
    expect(markup).toContain("Управление");
    expect(markup).toContain("Отчёт");
  });
});
