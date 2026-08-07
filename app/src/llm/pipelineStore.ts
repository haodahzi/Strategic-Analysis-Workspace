// 深度分析生成的「后台运行」store：生成过程放在组件之外，切换页面 / 离开工作区都不中断、
// 结果留着（#2）。组件只订阅、不拥有生成状态。按 analysisId 分桶。
import {
  MockReport, PipelineCtx, PipelineInput, REPORT_PIPELINE, StageResult,
  buildDigestRequest, buildStageRequest, chunkText, mockReport, mockStageOutput,
} from "./pipeline";
import { AppConfig, ChatRequest, LLMClient } from "./types";
import { loadConfig, providerById } from "../config/store";
import { makeClient } from "./adapters";
import { getLlmFetch } from "./runtime";
import { saveReport } from "./reportLib";
import { markUnread } from "./unread";
import { SearchHit, buildQueryGenRequest, gatherSources, parseAliases, parseQueries, queriesFor, searchEnabled, sourcesBlock, subjectTerms } from "./search";
import { kvGet, kvSet } from "../data/persist";

export type RunStatus = "待执行" | "进行中" | "完成";
export interface Attachment { name: string; text: string; url?: string; }   // 上传/抓取的资料正文（后台喂模型，不在前台展示原文 #5）；url 为抓取网页时的来源链接
export interface RunState {
  started: boolean;
  running: boolean;
  done: boolean;
  status: Record<string, RunStatus>;
  outputs: StageResult[];
  report: MockReport | null;   // Mock 结构化成品
  realReport: string | null;   // 真实模型的定稿文本
  err: string;
  materials: string;           // 用户手写的备注 / 已知要点
  attachments: Attachment[];   // 上传的 PDF / 文本提取出的正文
  sources: SearchHit[];        // 联网检索到的来源（供正文引用 + 文末参考文献）
  progress: string;            // 当前步的细粒度进度（如分块精读 3/8 段）
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const runs = new Map<string, RunState>();
const listeners = new Map<string, Set<() => void>>();

function empty(): RunState {
  return { started: false, running: false, done: false, status: {}, outputs: [], report: null, realReport: null, err: "", materials: "", attachments: [], sources: [], progress: "" };
}

// 惰性初始化并返回稳定引用（配合 useSyncExternalStore）
export function getRun(id: string): RunState {
  let s = runs.get(id);
  if (!s) { s = empty(); runs.set(id, s); }
  return s;
}

export function subscribe(id: string, fn: () => void): () => void {
  let set = listeners.get(id);
  if (!set) { set = new Set(); listeners.set(id, set); }
  set.add(fn);
  return () => { set!.delete(fn); };
}

function notify(id: string) { listeners.get(id)?.forEach((fn) => fn()); }
function patch(id: string, p: Partial<RunState>) { runs.set(id, { ...getRun(id), ...p }); notify(id); persistSoon(); }

// —— 运行状态落盘（重启不丢 #9）：材料 / 附件 / 各步产物 / 定稿正文都存下来，只是不存瞬时的 running/progress。
const RUNS_KEY = "dw.runs.v1";
let saveTimer: ReturnType<typeof setTimeout> | null = null;
function persistSoon() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { void persistRuns(); }, 700);   // 合并高频更新，落一次盘
}
function serializeRuns(): string {
  const obj: Record<string, unknown> = {};
  for (const [id, s] of runs) {
    if (!s.started && !s.materials && !s.attachments.length) continue;   // 空壳不落
    obj[id] = { started: s.started, done: s.done, status: s.status, outputs: s.outputs, realReport: s.realReport, materials: s.materials, attachments: s.attachments, sources: s.sources };
  }
  return JSON.stringify(obj);
}
async function persistRuns() { try { await kvSet(RUNS_KEY, serializeRuns()); } catch { /* 忽略 */ } }

// 启动时回灌（App 挂载时调用一次）：把落盘的运行状态填回内存 Map，running 复位为 false。
let hydrated = false;
export async function hydrateRuns(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const raw = await kvGet(RUNS_KEY);
  if (!raw) return;
  try {
    const obj = JSON.parse(raw) as Record<string, Partial<RunState>>;
    for (const id of Object.keys(obj)) {
      const s = obj[id];
      runs.set(id, {
        ...empty(),
        started: !!s.started, done: !!s.done,
        status: s.status ?? {}, outputs: s.outputs ?? [],
        realReport: s.realReport ?? null,
        materials: s.materials ?? "", attachments: s.attachments ?? [], sources: s.sources ?? [],
      });
      notify(id);
    }
  } catch { /* 损坏则忽略 */ }
}

export function setMaterials(id: string, materials: string) { patch(id, { materials }); }
export function addAttachment(id: string, a: Attachment) {
  const cur = getRun(id).attachments.filter((x) => x.name !== a.name);
  patch(id, { attachments: [...cur, a] });
}
export function removeAttachment(id: string, name: string) {
  patch(id, { attachments: getRun(id).attachments.filter((x) => x.name !== name) });
}

// 手写备注 + 附件正文合并成喂给模型的材料（附件原文只在这里进模型，不在前台展示）
function effectiveMaterials(s: RunState): string {
  return [s.materials.trim(), ...s.attachments.map((a) => `【附件：${a.name}】\n${a.text}`)].filter(Boolean).join("\n\n");
}

// 长文本生成：命中输出上限就自动续写、拼接，直到写完或达轮数上限（#5 篇幅不再受单次 token 限制）。
async function sendComplete(client: LLMClient, req: ChatRequest, maxRounds = 5): Promise<string> {
  const messages = [...req.messages];
  let full = "";
  for (let r = 0; r < maxRounds; r++) {
    const res = await client.send({ ...req, messages });
    full += res.text;
    if (!res.truncated || !res.text.trim()) break;
    messages.push({ role: "assistant", content: res.text });
    messages.push({ role: "user", content: "接着上文继续写完，从中断处直接续写，不要重复已写内容、不要重开标题或寒暄。" });
  }
  return full;
}

// B1：检索词生成——主路径用「规划」模型产出互不重复、覆盖不同角度的检索式；
// mock / 非真实 provider / 调用失败 / 产出过少（视为异常）时，回退硬化模板。均按 maxQueries 收口。
async function generateQueries(cfg: AppConfig, input: PipelineInput, fetchImpl: Awaited<ReturnType<typeof getLlmFetch>>): Promise<{ queries: string[]; aliases: string[] }> {
  const max = Math.min(15, Math.max(1, Math.round(cfg.search.maxQueries || 10)));
  const pick = cfg.agents["规划"];
  const prov = providerById(cfg, pick.provider);
  if (prov.id !== "mock") {
    try {
      const r = await makeClient(prov, fetchImpl).send(buildQueryGenRequest(input, pick.model, max));
      const queries = parseQueries(r.text, max);
      const aliases = parseAliases(r.text);           // 模型顺手补的别名，供相关性判定
      if (queries.length >= 3) return { queries, aliases };   // 太少视为异常 → 兜底
    } catch { /* 回退模板 */ }
  }
  return { queries: queriesFor(input).slice(0, max), aliases: [] };
}

// 启动 / 续跑一份深度分析。异步循环活在 store 里，组件卸载也继续。resume=从已完成的步接着跑（#6）。
async function runPipeline(id: string, input: PipelineInput, resume: boolean): Promise<void> {
  if (getRun(id).running) return;
  const cfg = loadConfig();
  const realMode = providerById(cfg, cfg.agents["起草"].provider).id !== "mock";

  if (resume) patch(id, { running: true, err: "" });
  else patch(id, { started: true, running: true, done: false, status: {}, outputs: [], report: null, realReport: null, err: "" });

  const materials = effectiveMaterials(getRun(id));

  if (!realMode) {
    const doneIds = new Set(getRun(id).outputs.map((o) => o.stageId));
    for (const s of REPORT_PIPELINE) {
      if (resume && doneIds.has(s.id)) continue;
      patch(id, { status: { ...getRun(id).status, [s.id]: "进行中" } });
      await sleep(480);
      patch(id, { outputs: [...getRun(id).outputs, mockStageOutput(s, input)], status: { ...getRun(id).status, [s.id]: "完成" } });
    }
    patch(id, { report: mockReport(input), done: true, running: false });
    return;
  }

  const ctx: PipelineCtx = { input, materials, outputs: {} };
  for (const o of getRun(id).outputs) ctx.outputs[o.stageId] = o.summary;   // resume：复原已完成步的产物，供后续步依赖
  const fetchImpl = await getLlmFetch();
  for (const s of REPORT_PIPELINE) {
    if (resume && ctx.outputs[s.id] != null) continue;
    patch(id, { status: { ...getRun(id).status, [s.id]: "进行中" } });
    // 「资料」步前先联网检索（若配了搜索）：先由模型生成检索词（B1），再并发取源、重排收口（B2/B2b/B4），
    // 把带编号与链接的来源并进材料；失败则降级为不联网。
    if (s.id === "research" && searchEnabled(cfg)) {
      try {
        patch(id, { progress: "生成检索词…" });
        const { queries, aliases } = await generateQueries(cfg, input, fetchImpl);
        patch(id, { progress: `联网检索 ${queries.length} 个角度…` });
        const hits = await gatherSources(cfg, input, queries, subjectTerms(input, aliases));
        patch(id, { progress: "" });
        if (hits.length) { patch(id, { sources: hits }); ctx.materials = [materials, sourcesBlock(hits)].filter(Boolean).join("\n\n"); }
      } catch { patch(id, { progress: "" }); /* 检索失败不阻断 */ }
    }
    const pick = cfg.agents[s.role];
    const p2 = providerById(cfg, pick.provider);
    try {
      let text: string;
      if (s.id === "research") {
        // 分块精读：长材料切块逐块抽取，逐页读完而非略读；短材料则单次即可
        const chunks = chunkText(ctx.materials, 6000);
        if (chunks.length > 1) {
          const digests: string[] = [];
          for (let ci = 0; ci < chunks.length; ci++) {
            patch(id, { progress: `精读材料 ${ci + 1}/${chunks.length} 段…` });
            const r = await makeClient(p2, fetchImpl).send(buildDigestRequest(input, chunks[ci], ci + 1, chunks.length, pick.model));
            if (r.text.trim() && !/本段无相关内容/.test(r.text)) digests.push(`【材料第 ${ci + 1} 段】\n${r.text}`);
          }
          patch(id, { progress: "" });
          text = digests.join("\n\n") || "（材料中未抽取到与本主题相关的内容）";
        } else {
          text = await sendComplete(makeClient(p2, fetchImpl), buildStageRequest(s, ctx, pick.model), 1);
        }
      } else {
        // 起草 / 定稿是正文，命中上限自动续写把篇幅写足；其余步骤单次即可
        const rounds = s.id === "draft" || s.id === "final" ? 5 : 1;
        text = await sendComplete(makeClient(p2, fetchImpl), buildStageRequest(s, ctx, pick.model), rounds);
      }
      ctx.outputs[s.id] = text;
      patch(id, { outputs: [...getRun(id).outputs.filter((o) => o.stageId !== s.id), { stageId: s.id, summary: text }], status: { ...getRun(id).status, [s.id]: "完成" } });
    } catch (e) {
      patch(id, { err: `${p2.label}（${s.role}）：${(e as Error).message.slice(0, 160)}`, status: { ...getRun(id).status, [s.id]: "待执行" }, running: false, progress: "" });
      return;
    }
  }
  // 文末附真实来源（#E）：你上传/抓取的研报靠前（代表你认可质量 #4），联网检索来源在后
  let md = ctx.outputs["final"] ?? "";
  const refs = [
    ...getRun(id).attachments.map((a) => (a.url ? `[${a.name}](${a.url})（上传 / 抓取）` : `${a.name}（上传材料）`)),
    ...getRun(id).sources.map((h) => `[${h.title || h.url}](${h.url})`),
  ];
  if (md.trim() && refs.length && !/(^|\n)#{1,6}\s*参考(资料|文献)/.test(md)) {
    md += "\n\n## 参考资料\n\n" + refs.map((r, i) => `${i + 1}. ${r}`).join("\n");
  }
  patch(id, { realReport: md, done: true, running: false });
  // #8：定稿完成即联动进报告库（同一单同类型自动更新，不产生重复）
  if (md.trim()) {
    const subject = input.company || input.industry;
    saveReport({ analysisId: id, title: `${subject} · ${input.focus}`, subject, focus: input.focus, markdown: md });
    markUnread(id);   // #7：完成打绿点，点开即消
  }
}

export function startRun(id: string, input: PipelineInput): Promise<void> { return runPipeline(id, input, false); }
export function resumeRun(id: string, input: PipelineInput): Promise<void> { return runPipeline(id, input, true); }
