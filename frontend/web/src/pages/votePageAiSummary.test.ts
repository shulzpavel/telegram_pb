import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Guard against the mobile-scroll refactor re-wrapping the voter AI card in a
 * collapsible shell. Cockpit and vote screens must render the same component
 * without truncation.
 */
describe("VotePage AI summary parity", () => {
  it("renders AiSummaryView directly without CollapsibleSection", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const source = readFileSync(join(here, "VotePage.tsx"), "utf8");

    expect(source).toContain("AiSummaryView");
    expect(source).not.toContain("CollapsibleSection");
  });
});
