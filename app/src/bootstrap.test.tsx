import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import {
  bootstrapApplication,
  createApplicationTree,
  createRuntimeIntelligenceBoot,
  SecureBootstrapFailure,
} from "./bootstrap";
import type { IntelligencePlatform } from "./features/intelligence/domain/platform";
import type { IntelligenceBootCoordinator } from "./features/intelligence/application/intelligenceBoot";
import type { SecretStore } from "./features/intelligence/infrastructure/secureConfig";

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

function secretStore(persistence: "native" | "session-only" = "native"): SecretStore {
  return {
    persistence,
    get: vi.fn().mockResolvedValue(undefined),
    set: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
  };
}

describe("application bootstrap", () => {
  afterEach(() => vi.unstubAllGlobals());
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
    await vi.waitFor(() => expect(coordinator.start).toHaveBeenCalledTimes(1));
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
      createNativeSecrets: () => secretStore(),
      bootstrapSecure: vi.fn().mockResolvedValue({ storage: "persistent-native" }),
      render,
    });

    expect(render).toHaveBeenCalledTimes(1);
    expect(coordinator.getSnapshot()).toEqual({ status: "error" });
  });

  it("orders native secure bootstrap before intelligence start and render", async () => {
    const events: string[] = [];
    const coordinator: IntelligenceBootCoordinator = {
      start: vi.fn(async () => { events.push("intelligence"); }),
      retry: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: vi.fn(() => ({ status: "ready", recovery: { interruptedRunIds: [], catchUpFrom: null, catchUpTo: "now" } })),
    };
    await bootstrapApplication({
      detectTauri: () => true,
      coordinator,
      createNativeSecrets: () => secretStore(),
      bootstrapSecure: vi.fn(async () => { events.push("secure"); return { storage: "persistent-native" }; }),
      render: vi.fn(() => { events.push("render"); }),
    });
    expect(events).toEqual(["secure", "intelligence", "render"]);
  });

  it("blocks native startup on safe secure failure and retries before normal App", async () => {
    const bootstrap = vi.fn()
      .mockRejectedValueOnce(new Error("private credential platform sentinel"))
      .mockResolvedValueOnce({ storage: "persistent-native" });
    const coordinator: IntelligenceBootCoordinator = {
      start: vi.fn().mockResolvedValue(undefined),
      retry: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: vi.fn(() => ({ status: "initializing" })),
    };
    const render = vi.fn();
    const completion = bootstrapApplication({
      detectTauri: () => true,
      coordinator,
      createNativeSecrets: () => secretStore(),
      bootstrapSecure: bootstrap,
      render,
    });
    await vi.waitFor(() => expect(render).toHaveBeenCalledTimes(1));
    expect(coordinator.start).not.toHaveBeenCalled();
    const failure = render.mock.calls[0][0];
    expect(failure.type).toBe(SecureBootstrapFailure);
    expect(JSON.stringify(failure.props)).not.toContain("private credential platform sentinel");

    failure.props.retry();
    await completion;
    expect(bootstrap).toHaveBeenCalledTimes(2);
    expect(coordinator.start).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[1][0].props.children.type).toBe(App);
  });

  it("browser bootstrap bypasses native secret and intelligence factories", async () => {
    const nativeSecrets = vi.fn(() => { throw new Error("native secret must not run"); });
    const nativePlatform = vi.fn(() => { throw new Error("native intelligence must not run"); });
    const render = vi.fn();

    const coordinator = await bootstrapApplication({
      detectTauri: () => false,
      createNativeSecrets: nativeSecrets,
      createPlatform: nativePlatform,
      render,
    });

    expect(nativeSecrets).not.toHaveBeenCalled();
    expect(nativePlatform).not.toHaveBeenCalled();
    expect(coordinator.getSnapshot()).toEqual({ status: "unavailable" });
    expect(render).toHaveBeenCalledTimes(1);
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
