// 多模型适配层类型。详见 docs/详细设计-多模型适配与导出模板.md。
export type ProviderStyle = "anthropic" | "openai";
export type ProviderId = "claude" | "openai" | "deepseek" | "zhipu" | "kimi" | "mock";

export interface ProviderConfig {
  id: ProviderId;
  label: string;
  style: ProviderStyle;
  baseUrl: string;
  apiKey?: string;
  models: string[];
}

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }

export interface ChatRequest {
  model: string;
  system?: string;
  messages: ChatMessage[];
  maxTokens?: number;
  jsonSchema?: object; // 传入则要求结构化输出（Claude: output_config.format；OpenAI: json_object）
}

export interface HttpSpec { url: string; headers: Record<string, string>; body: unknown; }
export interface LLMResult { text: string; raw?: unknown; }
export interface LLMClient { send(req: ChatRequest): Promise<LLMResult>; }

// 多智能体子任务：报告流水线按这些子任务推进，各自可选模型（红队宜换一家/一款互查）。
export const AGENT_ROLES = ["规划", "资料", "起草", "红队", "定稿", "验收"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];
export interface ModelPick { provider: ProviderId; model: string; }

// 联网检索（用户自配的搜索 API，如 Tavily）——为报告接地、给真实引用来源。
export interface SearchConfig {
  provider: "none" | "tavily";
  apiKey?: string;
  baseUrl: string;      // 如 https://api.tavily.com/search
  maxResults: number;   // 每条查询取回条数
}

export interface AppConfig {
  providers: ProviderConfig[];
  defaultProvider: ProviderId;
  step0: ModelPick;                         // 定框（Step 0）
  agents: Record<AgentRole, ModelPick>;     // 多智能体子任务
  search: SearchConfig;                     // 联网检索
}
