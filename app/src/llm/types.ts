// 多模型适配层类型。详见 docs/详细设计-多模型适配与导出模板.md。
export type ProviderStyle = "anthropic" | "openai";
export type ProviderId = "claude" | "openai" | "deepseek" | "zhipu" | "kimi" | "ali" | "mock";

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
  images?: string[];   // 传入则走多模态：把这些图片（base64 data URL）随最后一条 user 消息一起发（视觉解析）
  disableThinking?: boolean; // 关闭「思考模式」（仅对 DeepSeek 生效）：避免思维链吃光输出预算导致最终正文为空
}

export interface HttpSpec { url: string; headers: Record<string, string>; body: unknown; }
export interface LLMResult { text: string; raw?: unknown; truncated?: boolean; }   // truncated=命中输出上限，需续写
export interface LLMClient { send(req: ChatRequest): Promise<LLMResult>; }

// 多智能体子任务：报告流水线按这些子任务推进，各自可选模型（红队宜换一家/一款互查）。
export const AGENT_ROLES = ["规划", "资料", "起草", "红队", "定稿", "验收"] as const;
export type AgentRole = (typeof AGENT_ROLES)[number];
export interface ModelPick { provider: ProviderId; model: string; }

// 联网检索（用户自配的搜索 API，如 Tavily）——为报告接地、给真实引用来源。
export interface SearchConfig {
  provider: "none" | "tavily" | "bocha";
  apiKey?: string;
  baseUrl: string;         // tavily: https://api.tavily.com/search；bocha: https://api.bocha.cn/v1/web-search
  maxResults: number;      // 每条查询的候选池大小（内部：越大候选越多、重排后按 maxSources 收口）
  maxQueries: number;      // B2：每份报告的检索角度数（7–15，上限；去重后不足不硬凑）
  maxSources: number;      // B2b：召回上限（重排后最多保留几条；低于质量线者丢弃，冷门题材不硬填满）
  preferDomains: string[]; // 优先信息源域名（先在这些站内搜，再搜全网）
  freshness: string;       // B4：时间范围档（打分用软收紧，非 API 硬筛）：noLimit / oneYear / threeYears
}

// 数据源配置（内置浏览器登录取数 / 专用 API）——用户自填、可覆盖默认、可新增（企查查等高质量源 Key 都放这）。
export interface DataSourceCfg {
  id: string;          // 对应内置登记册 id，或自定义源 custom-*
  name?: string;       // 自定义源名称（内置源留空用登记册名）
  url?: string;        // 覆盖默认打开地址（内置浏览器）
  apiKey?: string;     // 专用数据源 API Key（如企查查）——仅存本机
  apiBase?: string;    // 覆盖默认 API 基址
  enabled: boolean;    // 是否在「从信息源获取」里显示 / 启用
}

export interface AppConfig {
  providers: ProviderConfig[];
  defaultProvider: ProviderId;
  step0: ModelPick;                         // 定框（Step 0）
  agents: Record<AgentRole, ModelPick>;     // 多智能体子任务
  search: SearchConfig;                     // 联网检索
  vision: ModelPick;                        // 文档视觉模型（扫描件 / 复杂表格用；可选）
  dataSources: DataSourceCfg[];             // 数据源（内置浏览器 + 专用 API），用户自填
}
