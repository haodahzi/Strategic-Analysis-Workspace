import React from "react";
import { describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  bootstrapApplication,
  createApplicationTree,
  createRuntimeIntelligenceBoot,
} from "./bootstrap";
import type { IntelligencePlatform } from "./features/intelligence/domain/platform";
import type { IntelligenceBootCoordinator } from "./features/intelligence/application/intelligenceBoot";

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function platform(): IntelligencePlatform {
  return {
    health: vi.fn().mockResolvedValue({ ready: true, schemaVersion: 1, dataDir: "data" }),
    fetchSnapshot: vi.fn(),
    listRecoverableRuns: vi.fn().mockResolvedValue([]),
    markRunInterrupted: vi.fn(),
    getLastSuccessfulSync: vi.fn().mockResolvedValue(null),
  };
}

describe("application bootstrap", () => {
  it("awaits start before rendering the StrictMode application tree", async () => {
    const pending = deferred();
    const coordinator: IntelligenceBootCoordinator = {
      start: vi.fn(() => pending.promise),
      retry: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: vi.fn(() => ({ status: "initializing" })),
    };
    const render = vi.fn();

    const bootstrapped = bootstrapApplication({ coordinator, render });
    expect(coordinator.start).toHaveBeenCalledTimes(1);
    expect(render).not.toHaveBeenCalled();
    pending.resolve();
    await bootstrapped;

    expect(render).toHaveBeenCalledTimes(1);
    const tree = render.mock.calls[0][0];
    expect(tree.type).toBe(React.StrictMode);
    expect(tree.props.children.type).toBe(App);
    expect(tree.props.children.props.intelligenceBoot).toBe(coordinator);
  });

  it("actual browser detection selects unavailable before constructing native platform", async () => {
    vi.stubGlobal("window", {});
    const createPlatform = vi.fn(() => platform());

    const coordinator = createRuntimeIntelligenceBoot({ createPlatform });
    await coordinator.start();

    expect(coordinator.getSnapshot()).toEqual({ status: "unavailable" });
    expect(createPlatform).not.toHaveBeenCalled();
  });

  it("actual desktop detection constructs native recovery once", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    const nativePlatform = platform();
    const createPlatform = vi.fn(() => nativePlatform);

    const coordinator = createRuntimeIntelligenceBoot({
      createPlatform,
      now: () => new Date("2026-08-01T00:00:00.000Z"),
    });
    await coordinator.start();
    await coordinator.start();

    expect(createPlatform).toHaveBeenCalledTimes(1);
    expect(nativePlatform.health).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot()).toEqual({
      status: "ready",
      recovery: {
        interruptedRunIds: [],
        catchUpFrom: null,
        catchUpTo: "2026-08-01T00:00:00.000Z",
      },
    });
  });

  it("renders the workspace after a caught recovery error", async () => {
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
    const failedPlatform = platform();
    vi.mocked(failedPlatform.health).mockRejectedValue(new Error("private detail"));
    const render = vi.fn();

    const coordinator = await bootstrapApplication({
      createPlatform: () => failedPlatform,
      render,
    });

    expect(render).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot()).toEqual({ status: "error" });
  });

  it("tree creation has no startup side effect", () => {
    const coordinator: IntelligenceBootCoordinator = {
      start: vi.fn(),
      retry: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: vi.fn(() => ({ status: "initializing" })),
    };

    createApplicationTree(coordinator);
    createApplicationTree(coordinator);

    expect(coordinator.start).not.toHaveBeenCalled();
  });
});
