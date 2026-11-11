import { describe, expect, it } from "vitest";
import {
  DEFAULT_TARGET_FOR_METRIC,
  METRICS_FOR_KIND,
  buildChallengeTitle,
  formatMetricValue,
  metricUnitLabel,
} from "./challengeDisplay";

describe("METRICS_FOR_KIND", () => {
  it("offers sessions for both kinds, and the kind-specific metric alongside", () => {
    expect(METRICS_FOR_KIND.endurance).toEqual(["distanceMeters", "sessions"]);
    expect(METRICS_FOR_KIND.strength).toEqual(["reps", "sessions"]);
  });
});

describe("DEFAULT_TARGET_FOR_METRIC", () => {
  it("expresses distance in the form's unit (km), not the stored one (m)", () => {
    expect(DEFAULT_TARGET_FOR_METRIC.distanceMeters).toBe(5);
    expect(DEFAULT_TARGET_FOR_METRIC.reps).toBe(100);
    expect(DEFAULT_TARGET_FOR_METRIC.sessions).toBe(1);
  });
});

describe("metricUnitLabel", () => {
  it("labels each metric", () => {
    expect(metricUnitLabel("distanceMeters")).toBe("km");
    expect(metricUnitLabel("sessions")).toBe("sessions");
    expect(metricUnitLabel("reps")).toBe("reps");
  });
});

describe("formatMetricValue", () => {
  it("converts stored metres to kilometres", () => {
    expect(formatMetricValue("distanceMeters", 5000)).toBe("5km");
    expect(formatMetricValue("distanceMeters", 5500)).toBe("5.50km");
  });

  it("drops the decimals on a whole number of kilometres", () => {
    expect(formatMetricValue("distanceMeters", 10000)).toBe("10km");
  });

  it("singularises one session", () => {
    expect(formatMetricValue("sessions", 1)).toBe("1 session");
    expect(formatMetricValue("sessions", 3)).toBe("3 sessions");
    // Zero takes the plural, as English does.
    expect(formatMetricValue("sessions", 0)).toBe("0 sessions");
  });

  it("renders reps without pluralising", () => {
    expect(formatMetricValue("reps", 1)).toBe("1 reps");
    expect(formatMetricValue("reps", 100)).toBe("100 reps");
  });
});

describe("buildChallengeTitle", () => {
  it("omits the target for a sessions challenge, which has none worth naming", () => {
    expect(buildChallengeTitle(30, "sessions", 1, "Running")).toBe("30 Days of Running");
  });

  it("includes the km target for a distance challenge", () => {
    expect(buildChallengeTitle(30, "distanceMeters", 5, "Running")).toBe("30 Days of 5km Running");
  });

  it("keeps one decimal on a fractional target", () => {
    expect(buildChallengeTitle(7, "distanceMeters", 2.5, "Running")).toBe("7 Days of 2.5km Running");
  });

  it("names a reps challenge without a unit suffix", () => {
    expect(buildChallengeTitle(30, "reps", 100, "Push-ups")).toBe("30 Days of 100 Push-ups");
  });
});
