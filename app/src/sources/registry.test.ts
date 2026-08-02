import { describe, it, expect } from "vitest";
import { DATA_SOURCES, effectiveSources, sourceById, allSourceDomains } from "./registry";

describe("数据源登记册", () => {
  it("内置源含用户点名的三家 + 巨潮，且荣大已改名「荣大二郎神」", () => {
    const names = DATA_SOURCES.map((s) => s.name);
    expect(names).toContain("报告查一查");
    expect(names).toContain("企查查");
    expect(names).toContain("荣大二郎神");
    expect(names).toContain("巨潮资讯");
    expect(names).not.toContain("荣大");   // 旧名不应残留
  });

  it("effectiveSources：用户覆盖网址 / API 生效，其余回落默认", () => {
    const eff = effectiveSources([
      { id: "baogaocha", url: "https://my.baogaocha.test", enabled: true },
      { id: "qcc", apiKey: "K", enabled: false },
    ]);
    const bg = eff.find((s) => s.id === "baogaocha")!;
    expect(bg.url).toBe("https://my.baogaocha.test");
    expect(bg.custom).toBe(false);
    const qcc = eff.find((s) => s.id === "qcc")!;
    expect(qcc.apiKey).toBe("K");
    expect(qcc.enabled).toBe(false);
    expect(qcc.url).toBe(sourceById("qcc")!.url);   // 未覆盖网址 → 默认
  });

  it("effectiveSources：自定义源全部字段取自配置，custom=true", () => {
    const eff = effectiveSources([{ id: "custom-1", name: "内网库", url: "https://intra.test", apiBase: "https://api.intra.test", enabled: true }]);
    const c = eff[0];
    expect(c.custom).toBe(true);
    expect(c.name).toBe("内网库");
    expect(c.kind).toBe("both");   // 填了 apiBase → both
  });

  it("allSourceDomains 去重且非空", () => {
    const d = allSourceDomains();
    expect(d.length).toBeGreaterThan(0);
    expect(new Set(d).size).toBe(d.length);
  });
});
