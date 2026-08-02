// 站内自动抓取的「决策核心」——纯函数、可单测。注入脚本只负责从 DOM 读原始候选（title/href/是否在列表行/附近有无日期），
// 由这里打分、过滤掉登录/导航噪声、补全链接、去重、排版成「研报清单」。选择器猜不准没关系，脏数据在这一层清。
export interface RawCand { title: string; href: string; meta?: string; inList?: boolean; dateNear?: boolean; }
export interface Report { title: string; url: string; meta: string; }

// 明显不是研报的锚文本（登录/导航/营销）——命中直接淘汰
const BLOCK = /^(登录|注册|退出|首页|更多|下一页|上一页|上页|下页|返回|客服|帮助|反馈|意见反馈|关于我们|联系我们|下载\s*app|下载客户端|微信|微博|vip|开通会员|会员中心|个人中心|我的|设置|搜索|全部|筛选|排序|收藏|分享|举报|购物车|立即购买|免费试用)$/i;

// href 是否像「一篇研报 / 详情 / 文件」的链接
function hrefLooksReport(u: string): boolean {
  return /\.(pdf|doc|docx|xlsx?)($|\?)/i.test(u)
    || /\/(report|research|detail|article|yanbao|yb|doc|docs?|file|download|content|view|p|d)\//i.test(u)
    || /[?&](id|docid|reportid|fileid)=/i.test(u)
    || /\/\d{4,}(\/|$|\?|\.)/.test(u);   // 末段是长数字 id
}

// 把相对 / 协议相对 / 根相对链接补成绝对地址；无法解析或非 http(s) 则返回空串
export function absolutize(base: string, href: string): string {
  const h = (href || "").trim();
  if (!h || /^(javascript:|mailto:|tel:|#)/i.test(h)) return "";
  try {
    const u = new URL(h, base || undefined);
    return u.protocol === "http:" || u.protocol === "https:" ? u.href : "";
  } catch {
    return "";
  }
}

// 候选打分：href 像研报(+2)、附近有日期(+1)、在列表行内(+1)、标题够长(+1)；命中黑名单直接出局
export function scoreCandidate(c: RawCand): number {
  const title = (c.title || "").trim();
  if (title.length < 5 || BLOCK.test(title)) return -1;
  let s = 0;
  if (hrefLooksReport(c.href || "")) s += 2;
  if (c.dateNear) s += 1;
  if (c.inList) s += 1;
  if (title.length >= 10) s += 1;
  return s;
}

// 从原始候选里挑出研报：打分达标 → 补全链接 → 按 url 去重 → 截断上限
export function selectReports(cands: RawCand[], pageUrl: string, limit = 150): Report[] {
  const out: Report[] = [];
  const seen = new Set<string>();
  for (const c of cands || []) {
    if (scoreCandidate(c) < 2) continue;
    const url = absolutize(pageUrl, c.href);
    if (!url || seen.has(url)) continue;
    seen.add(url);
    out.push({ title: (c.title || "").trim().replace(/\s+/g, " ").slice(0, 140), url, meta: (c.meta || "").trim().slice(0, 40) });
    if (out.length >= limit) break;
  }
  return out;
}

// 排版成「研报清单」markdown：进本单资料（模型据此掌握可取研报 + 真实链接），来源页作附件链接进参考文献
export function buildReportClipping(sourceName: string, pageUrl: string, cands: RawCand[]): { name: string; url: string; text: string } | null {
  const reps = selectReports(cands, pageUrl);
  if (!reps.length) return null;
  const lines = reps.map((r, i) => `${i + 1}. [${r.title}](${r.url})${r.meta ? ` · ${r.meta}` : ""}`);
  const text = `# ${sourceName} · 研报清单（本页 ${reps.length} 篇）\n\n> 来源页：${pageUrl}\n> 说明：以下为本页检索到的研报标题与链接；需要正文请在内置浏览器打开对应条目下载 PDF 后上传（质量最高）。\n\n${lines.join("\n")}`;
  return { name: `${sourceName} · 研报清单（${reps.length}篇）`, url: pageUrl, text };
}
