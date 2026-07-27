// 洽谈清单一键生成（#5）的异步编排：走「起草」子任务配置的模型；无真实 Key 则用 mock。
// 有深度分析成稿时接地生成（更贴本单命门），没有也能按内置框架给一版。
import { ChecklistItem, PipelineInput, buildChecklistRequest, mockChecklist, parseChecklist } from "./pipeline";
import { loadConfig, providerById } from "../config/store";
import { makeClient } from "./adapters";
import { getLlmFetch } from "./runtime";

export async function generateChecklist(input: PipelineInput, reportText: string): Promise<ChecklistItem[]> {
  const cfg = loadConfig();
  const pick = cfg.agents["起草"];
  const prov = providerById(cfg, pick.provider);
  if (prov.id === "mock") return mockChecklist(input);
  const fetchImpl = await getLlmFetch();
  const res = await makeClient(prov, fetchImpl).send(buildChecklistRequest(input, reportText, pick.model));
  const items = parseChecklist(res.text);
  return items.length ? items : mockChecklist(input); // 模型跑偏解析为空时兜底
}
