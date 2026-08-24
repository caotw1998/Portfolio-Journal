import { describe, expect, test } from "vitest";
import { isInternalWorkerPath } from "../../proxy";

describe("private access proxy", () => {
  test("lets only token-authenticated worker routes reach their route handlers", () => {
    expect(isInternalWorkerPath("/api/internal/sync-jobs/run")).toBe(true);
    expect(isInternalWorkerPath("/api/internal/benchmark-valuations/sync")).toBe(true);
    expect(isInternalWorkerPath("/api/internal/benchmark-valuations/sync/extra")).toBe(false);
    expect(isInternalWorkerPath("/api/funds")).toBe(false);
  });
});
