// 深度分析生成的「后台运行」store：生成过程放在组件之外，切换页面 / 离开工作区都不中断、
// 结果留着（#2）。组件只订阅、不拥有生成状态。按 analysisId 分桶。
import {
  MockReport, PipelineCtx, PipelineInput, REPORT_PIPELINE, StageResult,
  buildStageRequest, mockReport, mockStageOutput,
} from "./pipeline";
import { loadConfig, providerById } from "../config/store";
import { makeClient } from "./adapters";
import { getLlmFetch } from "./runtime";
import { saveReport } from "./reportLib";
import { markUnread } from "./unread";
import { SearchHit, gatherSources, referencesMd, searchEnabled, sourcesBlock } from "./search";

export type RunStatus = "待执行" | "进行中" | "完成";
export interface Attachment { name: string; text: string; }   // 上传资料提取出的文本（后台喂模型，不在前台展示原文 #5）
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
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const runs = new Map<string, RunState>();
const listeners = new Map<string, Set<() => void>>();

function empty(): RunState {
  return { started: false, running: false, done: false, status: {}, outputs: [], report: null, realReport: null, err: "", materials: "", attachments: [], sources: [] };
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
function patch(id: string, p: Partial<RunState>) { runs.set(id, { ...getRun(id), ...p }); notify(id); }

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
    // 「资料」步前先联网检索（若配了搜索），把带编号与链接的来源并进材料；失败则降级为不联网
    if (s.id === "research" && searchEnabled(cfg)) {
      try {
        const hits = await gatherSources(cfg, input);
        if (hits.length) { patch(id, { sources: hits }); ctx.materials = [materials, sourcesBlock(hits)].filter(Boolean).join("\n\n"); }
      } catch { /* 检索失败不阻断 */ }
    }
    const pick = cfg.agents[s.role];
    const p2 = providerById(cfg, pick.provider);
    try {
      const res = await makeClient(p2, fetchImpl).send(buildStageRequest(s, ctx, pick.model));
      ctx.outputs[s.id] = res.text;
      patch(id, { outputs: [...getRun(id).outputs.filter((o) => o.stageId !== s.id), { stageId: s.id, summary: res.text }], status: { ...getRun(id).status, [s.id]: "完成" } });
    } catch (e) {
      patch(id, { err: `${p2.label}（${s.role}）：${(e as Error).message.slice(0, 160)}`, status: { ...getRun(id).status, [s.id]: "待执行" }, running: false });
      return;
    }
  }
  let md = ctx.outputs["final"] ?? "";
  const src = getRun(id).sources;
  if (md.trim() && src.length && !md.includes("参考文献")) md += "\n\n" + referencesMd(src);   // 文末附真实来源（#E）
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
