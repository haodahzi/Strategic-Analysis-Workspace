import { describe, expect, it, vi } from "vitest";
import type { IntelligencePlatform } from "../domain/platform";
import { recoverOnStartup } from "./startupRecovery";

function createPlatform(overrides: Partial<IntelligencePlatform> = {}) {
  const createCollectionRun = vi.fn();
  const platform: IntelligencePlatform & { createCollectionRun: typeof createCollectionRun } = {
    health: vi.fn().mockResolvedValue({ ready: true, schemaVersion: 1, dataDir: "data" }),
    fetchSnapshot: vi.fn(),
    listRecoverableRuns: vi.fn().mockResolvedValue(["run-a", "run-b"]),
    markRunInterrupted: vi.fn().mockResolvedValue(undefined),
    getLastSuccessfulSync: vi.fn().mockResolvedValue("2026-07-31T23:00:00.000Z"),
    createCollectionRun,
    ...overrides,
  };
  return { platform, createCollectionRun };
}

describe("recoverOnStartup", () => {
  it("recovers in order and only prepares the catch-up window", async () => {
    const calls: string[] = [];
    const { platform, createCollectionRun } = createPlatform({
      health: vi.fn(async () => {
        calls.push("health");
        return { ready: true, schemaVersion: 1, dataDir: "data" };
      }),
      listRecoverableRuns: vi.fn(async () => {
        calls.push("list");
        return ["run-a", "run-b"];
      }),
      markRunInterrupted: vi.fn(async (id: string) => {
        calls.push(`mark:${id}`);
      }),
      getLastSuccessfulSync: vi.fn(async () => {
        calls.push("checkpoint");
        return "2026-07-31T23:00:00.000Z";
      }),
    });
    const now = vi.fn(() => {
      calls.push("now");
      return new Date("2026-08-01T01:02:03.000Z");
    });
    const setIntervalSpy = vi.spyOn(globalThis, "setInterval");
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout");

    const result = await recoverOnStartup(platform, now);

    expect(result).toEqual({
      interruptedRunIds: ["run-a", "run-b"],
      catchUpFrom: "2026-07-31T23:00:00.000Z",
      catchUpTo: "2026-08-01T01:02:03.000Z",
    });
    expect(calls).toEqual([
      "health",
      "list",
      "mark:run-a",
      "mark:run-b",
      "checkpoint",
      "now",
    ]);
    expect(platform.fetchSnapshot).not.toHaveBeenCalled();
    expect(createCollectionRun).not.toHaveBeenCalled();
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setIntervalSpy.mockRestore();
    setTimeoutSpy.mockRestore();
  });

  it("preserves a missing checkpoint as a null catch-up origin", async () => {
    const { platform } = createPlatform({
      listRecoverableRuns: vi.fn().mockResolvedValue([]),
      getLastSuccessfulSync: vi.fn().mockResolvedValue(null),
    });

    await expect(
      recoverOnStartup(platform, () => new Date("2026-08-01T00:00:00.000Z")),
    ).resolves.toEqual({
      interruptedRunIds: [],
      catchUpFrom: null,
      catchUpTo: "2026-08-01T00:00:00.000Z",
    });
  });

  it("aborts a failed attempt and can be called again from health", async () => {
    const health = vi
      .fn()
      .mockRejectedValueOnce(new Error("private database path"))
      .mockResolvedValueOnce({ ready: true, schemaVersion: 1, dataDir: "data" });
    const { platform } = createPlatform({ health });
    const now = () => new Date("2026-08-01T00:00:00.000Z");

    await expect(recoverOnStartup(platform, now)).rejects.toThrow();
    await expect(recoverOnStartup(platform, now)).resolves.toMatchObject({
      interruptedRunIds: ["run-a", "run-b"],
    });
    expect(health).toHaveBeenCalledTimes(2);
  });

  it("requires a ready health result before reading recovery state", async () => {
    const { platform } = createPlatform({
      health: vi.fn().mockResolvedValue({ ready: false, schemaVersion: 0, dataDir: "data" }),
    });

    await expect(
      recoverOnStartup(platform, () => new Date()),
    ).rejects.toThrow();
    expect(platform.listRecoverableRuns).not.toHaveBeenCalled();
  });
});
