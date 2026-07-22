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

// 需要按阶段路由的 LLM 阶段
export const LLM_STAGES = ["定框", "行业分析", "企业画像", "洽谈问题", "洽谈后"] as const;
export type LlmStage = (typeof LLM_STAGES)[number];

export interface AppConfig {
  providers: ProviderConfig[];
  defaultProvider: ProviderId;
  routing: Record<LlmStage, { provider: ProviderId; model: string }>;
}
