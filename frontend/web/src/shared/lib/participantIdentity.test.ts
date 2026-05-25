import { afterEach, describe, expect, it, vi } from "vitest";
import {
  loadWebIdentity,
  normalizeParticipantEmail,
  validateParticipantEmail,
  WEB_IDENTITY_STORAGE_KEY,
} from "./participantIdentity";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

describe("loadWebIdentity", () => {
  it("drops identities with roles that are no longer allowed", () => {
    vi.stubGlobal("localStorage", {
      getItem: (key: string) =>
        key === WEB_IDENTITY_STORAGE_KEY
          ? JSON.stringify({ email: "product.user@betboom.com", role: "product" })
          : null,
    });

    expect(loadWebIdentity()).toBeNull();
  });
});
