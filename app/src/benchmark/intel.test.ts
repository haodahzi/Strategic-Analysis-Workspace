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

  it("parseIntel：一律归入本次刷新月份（月初近7天回填的上月事件也进本月，不被视图筛掉）", () => {
    // 今天 9-01 刷新、回填近7天，事件发生在 8-28；应归入刷新月 2026-09，而非发生月 2026-08
    const out = JSON.stringify({ events: [
      { title: "省广集团中标某大单", type: "客户与市场", importance: "重要", occurTime: "2026-08-28", publishTime: "2026-08-29", sourceIdx: [1] },
    ] });
    const evs = parseIntel(out, hits, "u1", "c1", "省广集团", "2026-09");
    expect(evs[0].month).toBe("2026-09");
    expect(evs[0].occurTime).toBe("2026-08-28");   // 发生时间照常保留供显示
  });

  it("parseIntel：impact/action 里漏出的「业务单元N」占位被收敛为「我方」", () => {
    const out = JSON.stringify({ events: [
      { title: "某竞品降价", type: "渠道与市场", importance: "重要", facts: "降价", impact: "对我方业务单元1的客户与渠道形成挤压", action: "业务单元3应加强客户维护", sourceIdx: [1] },
    ] });
    const evs = parseIntel(out, hits, "u1", "c1", "X", "2026-09");
    expect(evs[0].impact).toBe("对我方的客户与渠道形成挤压");
    expect(evs[0].action).toBe("我方应加强客户维护");
  });

  it("buildIntelRequest：占位单元名不写进提示、真实单元名仅作背景且要求用「我方」自称", () => {
    expect(buildIntelRequest("蓝色光标", "业务单元1", hits, "本月").messages[0].content).not.toContain("业务单元1");
    const real = buildIntelRequest("蓝色光标", "集采事业部", hits, "本月").messages[0].content;
    expect(real).toContain("集采事业部");
    expect(real).toContain("用「我方」");
  });

  it("parseIntel：非法类型/重要性回退，无 JSON 返回空", () => {
    const out = JSON.stringify({ events: [{ title: "某事件", type: "乱写", importance: "乱写", sourceIdx: [1] }] });
    const evs = parseIntel(out, hits, "u1", "c1", "X", "2026-08");
    expect(evs[0].type).toBe("战略与经营");
    expect(evs[0].importance).toBe("一般");
    expect(parseIntel("不是json", hits, "u1", "c1", "X", "2026-08")).toEqual([]);
  });
});
