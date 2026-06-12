import { describe, expect, it } from "vitest";
import {
  DEFAULT_ESTIMATION_MODE,
  getEstimationModeOption,
  isSplitEstimationMode,
  resolveTrackForRole,
  resolveTrackLabel,
} from "./estimationModes";

describe("estimationModes", () => {
  it("defaults to single SP mode", () => {
    expect(getEstimationModeOption(undefined).mode).toBe(DEFAULT_ESTIMATION_MODE);
    expect(isSplitEstimationMode("sp")).toBe(false);
  });

  it("maps participant roles to tracks", () => {
    expect(resolveTrackForRole("sp_dev_test", "frontend")).toBe("dev");
    expect(resolveTrackForRole("sp_dev_test", "qa")).toBe("test");
    expect(resolveTrackForRole("sp_split", "backend")).toBe("back");
    expect(resolveTrackLabel("sp_split", "back")).toBe("SP Back");
  });
});
