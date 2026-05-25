import { describe, expect, it } from "vitest";
import {
  normalizeParticipantEmail,
  validateParticipantEmail,
} from "./participantIdentity";

describe("validateParticipantEmail", () => {
  it("accepts a normalized corporate email", () => {
    expect(validateParticipantEmail("Paul_S@Betboom.COM")).toBeNull();
    expect(normalizeParticipantEmail("Paul_S@Betboom.COM")).toBe("paul_s@betboom.com");
  });

  it("rejects empty and non-corporate addresses", () => {
    expect(validateParticipantEmail("")).toMatch(/почту/i);
    expect(validateParticipantEmail("paul@gmail.com")).toMatch(/betboom/i);
    expect(validateParticipantEmail("@betboom.com")).toMatch(/формате/i);
  });
});
