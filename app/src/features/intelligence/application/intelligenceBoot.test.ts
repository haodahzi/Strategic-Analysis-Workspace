import { describe, expect, it, vi } from "vitest";
import {
  createIntelligenceBootCoordinator,
  createUnavailableIntelligenceBootCoordinator,
} from "./intelligenceBoot";
import type { StartupRecovery } from "./startupRecovery";

const recovery: StartupRecovery = {
  interruptedRunIds: ["run-1"],
  catchUpFrom: "2026-07-31T00:00:00.000Z",
  catchUpTo: "2026-08-01T00:00:00.000Z",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("IntelligenceBootCoordinator", () => {
  it("returns the same in-flight Promise and remains one-shot after success", async () => {
    const pending = deferred<StartupRecovery>();
    const recover = vi.fn(() => pending.promise);
    const coordinator = createIntelligenceBootCoordinator(recover);

    const p1 = coordinator.start();
    const p2 = coordinator.start();
    expect(p1).toBe(p2);
    expect(recover).toHaveBeenCalledTimes(1);
    pending.resolve(recovery);
    await p1;

    const readySnapshot = coordinator.getSnapshot();
    expect(readySnapshot).toEqual({ status: "ready", recovery });
    expect(coordinator.getSnapshot()).toBe(readySnapshot);
    const p3 = coordinator.start();
    expect(p3).toBe(p1);
    await p3;
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("publishes stable snapshots, notifies after replacement, and unsubscribes", async () => {
    const pending = deferred<StartupRecovery>();
    const coordinator = createIntelligenceBootCoordinator(() => pending.promise);
    const initial = coordinator.getSnapshot();
    expect(initial).toBe(coordinator.getSnapshot());
    const observed: Array<{ status: string }> = [];
    const unsubscribe = coordinator.subscribe(() => {
      observed.push(coordinator.getSnapshot());
    });

    const started = coordinator.start();
    expect(coordinator.getSnapshot()).toBe(initial);
    pending.resolve(recovery);
    await started;
    expect(observed).toEqual([{ status: "ready", recovery }]);

    unsubscribe();
    await coordinator.start();
    expect(observed).toHaveLength(1);
  });

  it("publishes a redacted error and retry performs a new deduplicated attempt", async () => {
    const first = deferred<StartupRecovery>();
    const second = deferred<StartupRecovery>();
    const recover = vi
      .fn<() => Promise<StartupRecovery>>()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const coordinator = createIntelligenceBootCoordinator(recover);

    const start = coordinator.start();
    first.reject(new Error("C:\\private\\secret.db"));
    await start;
    expect(coordinator.getSnapshot()).toEqual({ status: "error" });
    expect(JSON.stringify(coordinator.getSnapshot())).not.toContain("private");

    const retry1 = coordinator.retry();
    const retry2 = coordinator.retry();
    expect(retry1).toBe(retry2);
    expect(coordinator.getSnapshot()).toEqual({ status: "initializing" });
    expect(recover).toHaveBeenCalledTimes(2);
    second.resolve(recovery);
    await retry1;
    expect(coordinator.getSnapshot()).toEqual({ status: "ready", recovery });
  });

  it("ignores retry outside error and never duplicates a successful recovery", async () => {
    const recover = vi.fn().mockResolvedValue(recovery);
    const coordinator = createIntelligenceBootCoordinator(recover);

    await coordinator.retry();
    expect(recover).not.toHaveBeenCalled();
    await coordinator.start();
    await coordinator.retry();
    expect(recover).toHaveBeenCalledTimes(1);
  });

  it("browser start publishes unavailable once without any recovery call", async () => {
    const forbidden = vi.fn();
    const coordinator = createUnavailableIntelligenceBootCoordinator();
    const snapshots: string[] = [];
    coordinator.subscribe(() => snapshots.push(coordinator.getSnapshot().status));

    const p1 = coordinator.start();
    const p2 = coordinator.start();
    expect(p1).toBe(p2);
    await p1;
    await coordinator.retry();

    expect(coordinator.getSnapshot()).toEqual({ status: "unavailable" });
    expect(snapshots).toEqual(["unavailable"]);
    expect(forbidden).not.toHaveBeenCalled();
  });
});
