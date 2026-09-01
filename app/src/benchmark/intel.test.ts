import { describe, it, expect } from "vitest";
import { buildIntelRequest, parseIntel } from "./intel";
import { SearchHit } from "../llm/search";

const hits: SearchHit[] = [
  { title: "蓝色光标发布AI战略", url: "https://finance.example.com/a", content: "官方发布" },
  { title: "蓝标增资子公司", url: "https://news.example.com/b", content: "增资" },
];

describe("对标情报 · 解析", () => {
  it("buildIntelRequest：要求 JSON、8 类事件、事实与分析分离、关闭思考", () => {
    const req = buildIntelRequest("蓝色光标", "业务单元1", hits, "本月（2026-08）");
    expect(req.disableThinking).toBe(true);
    expect(req.messages[0].content).toContain("投资、融资与并购");
    expect(req.messages[0].content).toContain("events");
    expect(req.messages[0].content).toContain("蓝色光标");
  });

  it("parseIntel：JSON→事件，校验类型/重要性/来源映射/月份；空标题丢弃", () => {
    const out = JSON.stringify({ events: [
      { title: "蓝色光标发布AI营销战略", type: "战略与经营", importance: "重大", occurTime: "2026-08-20", publishTime: "2026-08-21", facts: "官方发布AI战略", impact: "对我方营销业务构成竞争", action: "跟踪其AI产品", confidence: "高", confidenceBasis: "官方+多源", sourceIdx: [1, 2] },
      { title: "", type: "x", importance: "y", sourceIdx: [] },
    ] });
    const evs = parseIntel(out, hits, "u1", "c1", "蓝色光标", "2026-08");
    expect(evs.length).toBe(1);
    expect(evs[0].type).toBe("战略与经营");
    expect(evs[0].importance).toBe("重大");
    expect(evs[0].month).toBe("2026-08");
    expect(evs[0].sources.map((s) => s.url)).toEqual(["https://finance.example.com/a", "https://news.example.com/b"]);
    expect(evs[0].impact).toContain("竞争");
  });

  it("parseIntel：非法类型/重要性回退，无 JSON 返回空", () => {
    const out = JSON.stringify({ events: [{ title: "某事件", type: "乱写", importance: "乱写", sourceIdx: [1] }] });
    const evs = parseIntel(out, hits, "u1", "c1", "X", "2026-08");
    expect(evs[0].type).toBe("战略与经营");
    expect(evs[0].importance).toBe("一般");
    expect(parseIntel("不是json", hits, "u1", "c1", "X", "2026-08")).toEqual([]);
  });
});
