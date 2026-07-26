// 深度分析生成的「后台运行」store：生成过程放在组件之外，切换页面 / 离开工作区都不中断、
// 结果留着（#2）。组件只订阅、不拥有生成状态。按 analysisId 分桶。
import {
  MockReport, PipelineCtx, PipelineInput, REPORT_PIPELINE, StageResult,
  buildStageRequest, mockReport, mockStageOutput,
} from "./pipeline";
import { loadConfig, providerById } from "../config/store";
import { makeClient } from "./adapters";
import { getLlmFetch } from "./runtime";

export type RunStatus = "待执行" | "进行中" | "完成";
export interface RunState {
  started: boolean;
  running: boolean;
  done: boolean;
  status: Record<string, RunStatus>;
  outputs: StageResult[];
  report: MockReport | null;   // Mock 结构化成品
  realReport: string | null;   // 真实模型的定稿文本
  err: string;
  materials: string;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const runs = new Map<string, RunState>();
const listeners = new Map<string, Set<() => void>>();

function empty(): RunState {
  return { started: false, running: false, done: false, status: {}, outputs: [], report: null, realReport: null, err: "", materials: "" };
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

// 启动/重跑一份深度分析。异步循环活在 store 里，组件卸载也继续。
export async function startRun(id: string, input: PipelineInput): Promise<void> {
  if (getRun(id).running) return;
  const materials = getRun(id).materials;
  patch(id, { started: true, running: true, done: false, status: {}, outputs: [], report: null, realReport: null, err: "" });

  const cfg = loadConfig();
  const draftProv = providerById(cfg, cfg.agents["起草"].provider);
  const realMode = draftProv.id !== "mock";

  if (!realMode) {
    for (const s of REPORT_PIPELINE) {
      patch(id, { status: { ...getRun(id).status, [s.id]: "进行中" } });
      await sleep(480);
      patch(id, { outputs: [...getRun(id).outputs, mockStageOutput(s, input)], status: { ...getRun(id).status, [s.id]: "完成" } });
    }
    patch(id, { report: mockReport(input), done: true, running: false });
    return;
  }

  const ctx: PipelineCtx = { input, materials, outputs: {} };
  const fetchImpl = await getLlmFetch();
  for (const s of REPORT_PIPELINE) {
    patch(id, { status: { ...getRun(id).status, [s.id]: "进行中" } });
    const pick = cfg.agents[s.role];
    const p2 = providerById(cfg, pick.provider);
    try {
      const res = await makeClient(p2, fetchImpl).send(buildStageRequest(s, ctx, pick.model));
      ctx.outputs[s.id] = res.text;
      patch(id, { outputs: [...getRun(id).outputs, { stageId: s.id, summary: res.text }], status: { ...getRun(id).status, [s.id]: "完成" } });
    } catch (e) {
      patch(id, { err: `${p2.label}（${s.role}）：${(e as Error).message.slice(0, 160)}`, status: { ...getRun(id).status, [s.id]: "待执行" }, running: false });
      return;
    }
  }
  patch(id, { realReport: ctx.outputs["final"] ?? "", done: true, running: false });
}
