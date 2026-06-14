import { describe, expect, it } from "vitest";
import { splitTextWithLinks } from "./textWithLinks";

describe("splitTextWithLinks", () => {
  it("keeps plain text unchanged", () => {
    expect(splitTextWithLinks("Нужен rollback")).toEqual([{ kind: "text", value: "Нужен rollback" }]);
  });

  it("splits inline http links", () => {
    expect(splitTextWithLinks("Смотрим https://jira.example.com/browse/FLEX-1 до пятницы")).toEqual([
      { kind: "text", value: "Смотрим " },
      { kind: "link", href: "https://jira.example.com/browse/FLEX-1", label: "jira.example.com/browse/FLEX-1" },
      { kind: "text", value: " до пятницы" },
    ]);
  });

  it("moves trailing punctuation outside the link", () => {
    expect(splitTextWithLinks("Док: https://docs.example.com/a).")).toEqual([
      { kind: "text", value: "Док: " },
      { kind: "link", href: "https://docs.example.com/a", label: "docs.example.com/a" },
      { kind: "text", value: ")." },
    ]);
  });
});
