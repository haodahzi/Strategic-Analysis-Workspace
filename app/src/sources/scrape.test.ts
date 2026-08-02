import { describe, it, expect } from "vitest";
import { absolutize, scoreCandidate, selectReports, buildReportClipping, RawCand } from "./scrape";

describe("站内抓取 · 链接补全", () => {
  const base = "https://www.baogaocha.com/list?p=2";
  it("相对 / 根相对 / 协议相对 / 绝对 都能补成绝对 http(s)", () => {
    expect(absolutize(base, "/report/12345")).toBe("https://www.baogaocha.com/report/12345");
    expect(absolutize(base, "report/9.pdf")).toBe("https://www.baogaocha.com/report/9.pdf");
    expect(absolutize(base, "//cdn.baogaocha.com/a.pdf")).toBe("https://cdn.baogaocha.com/a.pdf");
    expect(absolutize(base, "https://x.com/y")).toBe("https://x.com/y");
  });
  it("javascript: / # / mailto: / 空 → 丢弃", () => {
    for (const h of ["", "#", "javascript:void(0)", "mailto:a@b.com", "tel:110"]) expect(absolutize(base, h)).toBe("");
  });
});

describe("站内抓取 · 候选打分（滤掉登录/导航噪声）", () => {
  it("登录/更多/下一页 等导航文本直接出局", () => {
    for (const t of ["登录", "更多", "下一页", "下载APP", "开通会员"]) {
      expect(scoreCandidate({ title: t, href: "/x/1" })).toBeLessThan(2);
    }
  });
  it("带研报详情链接的长标题达标；无链接特征、不在列表、无日期的短链接不达标", () => {
    expect(scoreCandidate({ title: "某行业2024年度深度研究报告", href: "/report/88231" })).toBeGreaterThanOrEqual(2);
    expect(scoreCandidate({ title: "帮助", href: "/help" })).toBeLessThan(2);
    // 列表行内 + 附近有日期，即便 href 普通也达标
    expect(scoreCandidate({ title: "储能行业跟踪", href: "/a", inList: true, dateNear: true })).toBeGreaterThanOrEqual(2);
  });
});

describe("站内抓取 · 选取与排版", () => {
  const page = "https://www.baogaocha.com/search?q=储能";
  const cands: RawCand[] = [
    { title: "登录", href: "/login" },
    { title: "储能行业2024深度报告：从政策到经济性", href: "/report/1001", meta: "2024-03-11" },
    { title: "钠离子电池产业化进展与展望", href: "report/1002.pdf", meta: "2024-01-08", inList: true, dateNear: true },
    { title: "储能行业2024深度报告：从政策到经济性", href: "/report/1001", meta: "2024-03-11" }, // 重复 → 去重
    { title: "下一页", href: "/search?q=储能&p=2" },
  ];
  it("selectReports：留研报、去重、补全链接、滤导航", () => {
    const reps = selectReports(cands, page);
    expect(reps.length).toBe(2);
    expect(reps[0].url).toBe("https://www.baogaocha.com/report/1001");
    expect(reps[1].url).toBe("https://www.baogaocha.com/report/1002.pdf");
  });
  it("buildReportClipping：生成带来源页与编号链接的清单；无命中返回 null", () => {
    const clip = buildReportClipping("报告查一查", page, cands)!;
    expect(clip.url).toBe(page);
    expect(clip.name).toContain("2篇");
    expect(clip.text).toContain("[储能行业2024深度报告：从政策到经济性](https://www.baogaocha.com/report/1001)");
    expect(clip.text).toContain("来源页：" + page);
    expect(buildReportClipping("报告查一查", page, [{ title: "登录", href: "/login" }])).toBeNull();
  });
});
