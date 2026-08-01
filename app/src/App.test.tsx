import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IntelligenceBootCoordinator } from "./features/intelligence/application/intelligenceBoot";

const capturedIntelligenceProps = vi.hoisted(() => ({
  current: undefined as undefined | {
    boot: import("./features/intelligence/application/intelligenceBoot").IntelligenceBootSnapshot;
    onRetry: () => void;
  },
}));

vi.mock("./features/intelligence", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./features/intelligence")>();
  return {
    ...actual,
    IntelligenceFeature: (props: {
      boot: import("./features/intelligence/application/intelligenceBoot").IntelligenceBootSnapshot;
      onRetry: () => void;
    }) => {
      capturedIntelligenceProps.current = props;
      return actual.IntelligenceFeature(
        props as Parameters<typeof actual.IntelligenceFeature>[0],
      );
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const react = await importOriginal<typeof import("react")>();
  return { ...react, useSyncExternalStore: <T,>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot() };
});

import App from "./App";

function installBrowserStubs(search = "") {
  const values = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  });
  vi.stubGlobal("window", { location: { search } });
}

describe("App intelligence navigation", () => {
  beforeEach(() => {
    installBrowserStubs();
    capturedIntelligenceProps.current = undefined;
  });

  it("includes the intelligence navigation item", () => {
    const html = renderToStaticMarkup(<App />);

    const reportNavigationIndex = html.indexOf("▦ 报告库");
    const intelligenceNavigationIndex = html.indexOf("◉ 对标企业情报");

    expect(intelligenceNavigationIndex).toBeGreaterThan(reportNavigationIndex);
  });

  it("renders the intelligence module from its query view without removing existing navigation", () => {
    installBrowserStubs("?view=intelligence");

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain('id="intelligence-title"');
    expect(html).toContain("正在检查本地数据");
    expect(html).toContain("研究分析总览");
    expect(html).toContain("报告库");
    expect(html).toContain("设置");
  });

  it("passes the shared error snapshot and working retry callback to intelligence", () => {
    installBrowserStubs("?view=intelligence");
    const retry = vi.fn().mockResolvedValue(undefined);
    const snapshot = { status: "error" } as const;
    const coordinator: IntelligenceBootCoordinator = {
      start: vi.fn(),
      retry,
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: () => snapshot,
    };

    const html = renderToStaticMarkup(<App intelligenceBoot={coordinator} />);

    expect(html).toContain('role="alert"');
    expect(capturedIntelligenceProps.current?.boot).toBe(snapshot);
    capturedIntelligenceProps.current?.onRetry();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("passes the exact ready recovery snapshot through without consuming it", () => {
    installBrowserStubs("?view=intelligence");
    const snapshot = {
      status: "ready",
      recovery: {
        interruptedRunIds: ["run-1"],
        catchUpFrom: "2026-07-31T00:00:00.000Z",
        catchUpTo: "2026-08-01T00:00:00.000Z",
      },
    } as const;
    const coordinator: IntelligenceBootCoordinator = {
      start: vi.fn(),
      retry: vi.fn(),
      subscribe: vi.fn(() => () => undefined),
      getSnapshot: () => snapshot,
    };

    renderToStaticMarkup(<App intelligenceBoot={coordinator} />);

    expect(capturedIntelligenceProps.current?.boot).toBe(snapshot);
    expect(snapshot.recovery).toEqual({
      interruptedRunIds: ["run-1"],
      catchUpFrom: "2026-07-31T00:00:00.000Z",
      catchUpTo: "2026-08-01T00:00:00.000Z",
    });
  });
});
