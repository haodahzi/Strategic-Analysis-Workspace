import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

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
  beforeEach(() => installBrowserStubs());

  it("includes the intelligence navigation item", () => {
    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("对标企业情报");
  });

  it("renders the intelligence module from its query view without removing existing navigation", () => {
    installBrowserStubs("?view=intelligence");

    const html = renderToStaticMarkup(<App />);

    expect(html).toContain("对标企业情报");
    expect(html).toContain("研究分析总览");
    expect(html).toContain("报告库");
    expect(html).toContain("设置");
  });
});
