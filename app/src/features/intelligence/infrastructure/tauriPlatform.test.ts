import { describe, expect, it } from "vitest";
import type {
  FetchSnapshotRequest,
  FetchSnapshotResult,
  IntelligenceHealth,
} from "../domain/platform";
import { createTauriPlatform, type Invoke } from "./tauriPlatform";

type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends
  (<Value>() => Value extends Right ? 1 : 2)
    ? true
    : false;
type Expect<Value extends true> = Value;
type FetchSnapshotRequestHasOnlySourceId = Expect<
  Equal<keyof FetchSnapshotRequest, "sourceId">
>;

describe("createTauriPlatform", () => {
  it("keeps the snapshot request contract sourceId-only", () => {
    const exactKeys: FetchSnapshotRequestHasOnlySourceId = true;

    expect(exactKeys).toBe(true);
  });

  it("maps health to intelligence_health without arguments", async () => {
    const health: IntelligenceHealth = {
      ready: true,
      schemaVersion: 1,
      dataDir: "intelligence-data",
    };
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const invoke: Invoke = async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return health as T;
    };

    const result = await createTauriPlatform(invoke).health();

    expect(result).toEqual(health);
    expect(calls).toEqual([["intelligence_health", undefined]]);
  });

  it("maps sourceId only to fetch_source_snapshot", async () => {
    const snapshot: FetchSnapshotResult = {
      finalUrl: "https://example.com/news",
      status: 200,
      contentType: "text/html",
      contentHash: "abc123",
      snapshotPath: "snapshots/abc123.html.gz",
      fetchedAt: "2026-08-01T00:00:00Z",
    };
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const invoke: Invoke = async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      return snapshot as T;
    };
    const request = {
      sourceId: "source-1",
      url: "https://attacker.invalid/override",
      expectedHost: "attacker.invalid",
    } as FetchSnapshotRequest & { url: string; expectedHost: string };

    const result = await createTauriPlatform(invoke).fetchSnapshot(request);

    expect(result).toEqual(snapshot);
    expect(calls).toEqual([
      ["fetch_source_snapshot", { request: { sourceId: "source-1" } }],
    ]);
  });

  it("maps recovery commands with exact names and arguments", async () => {
    const calls: Array<[string, Record<string, unknown> | undefined]> = [];
    const invoke: Invoke = async <T>(command: string, args?: Record<string, unknown>) => {
      calls.push([command, args]);
      if (command === "list_recoverable_runs") return ["run-1"] as T;
      if (command === "get_last_successful_sync") return "2026-08-01T00:00:00Z" as T;
      return undefined as T;
    };
    const platform = createTauriPlatform(invoke);

    await expect(platform.listRecoverableRuns()).resolves.toEqual(["run-1"]);
    await expect(platform.markRunInterrupted("run-1")).resolves.toBeUndefined();
    await expect(platform.getLastSuccessfulSync()).resolves.toBe("2026-08-01T00:00:00Z");
    expect(calls).toEqual([
      ["list_recoverable_runs", undefined],
      ["mark_run_interrupted", { runId: "run-1" }],
      ["get_last_successful_sync", undefined],
    ]);
  });
});
