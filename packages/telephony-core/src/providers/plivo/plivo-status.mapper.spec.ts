import { mapPlivoStatus } from "./plivo-status.mapper";

describe("mapPlivoStatus", () => {
  it.each([
    ["queued", "INITIATED"],
    ["initiated", "INITIATED"],
    ["ringing", "RINGING"],
    ["in-progress", "CONNECTED"],
    ["completed", "COMPLETED"],
    ["busy", "BUSY"],
    ["no-answer", "NO_ANSWER"],
    ["timeout", "NO_ANSWER"],
    ["canceled", "CANCELLED"],
    ["cancelled", "CANCELLED"],
    ["failed", "FAILED"],
  ])("maps Plivo status %s -> %s", (raw, expected) => {
    expect(mapPlivoStatus(raw)).toBe(expected);
  });

  it("is case-insensitive and tolerant of underscores/spaces", () => {
    expect(mapPlivoStatus("IN_PROGRESS")).toBe("CONNECTED");
    expect(mapPlivoStatus("In Progress")).toBe("CONNECTED");
  });

  it("defaults unknown statuses to FAILED rather than throwing", () => {
    expect(mapPlivoStatus("some-unrecognized-status")).toBe("FAILED");
  });
});
