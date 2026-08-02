import { describe, it, expect, beforeEach } from "vitest";
import { loadAnalysesAsync, saveAnalysesAsync } from "./analysesStore";
import { Analysis } from "../types";

class MemLS {
  private m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? this.m.get(k)! : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
  clear() { this.m.clear(); }
}
const KEY = "dw.analyses.v1";
const one: Analysis = { id: "a1", name: "测试分析", stage: "调研前", focus: "行业深度分析", industry: "储能" } as Analysis;

describe("在办分析持久化（落盘 / localStorage 回落）", () => {
  beforeEach(() => { (globalThis as unknown as { localStorage: MemLS }).localStorage = new MemLS(); });

  it("首次无数据 → 回落示例（非空）", async () => {
    expect((await loadAnalysesAsync()).length).toBeGreaterThan(0);
  });

  it("保存后再读 → 以本机数据为准", async () => {
    await saveAnalysesAsync([one]);
    const got = await loadAnalysesAsync();
    expect(got.length).toBe(1);
    expect(got[0].id).toBe("a1");
  });

  it("空数组也被尊重（删光后不再冒出示例）", async () => {
    await saveAnalysesAsync([]);
    expect((await loadAnalysesAsync()).length).toBe(0);
  });

  it("存储值损坏 → 回落示例，但不写回覆盖（下次仍读到原损坏值前，返回 seed 供渲染）", async () => {
    (globalThis as unknown as { localStorage: MemLS }).localStorage.setItem(KEY, "{坏掉的json");
    const got = await loadAnalysesAsync();
    expect(got.length).toBeGreaterThan(0);   // 返回 seed 而非崩溃
  });
});
