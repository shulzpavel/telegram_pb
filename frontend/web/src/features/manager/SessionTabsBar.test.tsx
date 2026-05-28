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

  it("can stretch tabs to full width on mobile header row", () => {
    const markup = renderToStaticMarkup(
      <MemoryRouter initialEntries={["/cms/sessions/42/cockpit"]}>
        <SessionTabsSegment chatId={42} stretch className="w-full" />
      </MemoryRouter>,
    );
    expect(markup).toContain('class="inline-flex shrink-0 rounded-md border border-line bg-line/40 p-0.5 flex w-full w-full"');
  });
});
