import { ProviderConfig, ProviderId } from "./types";

// 各提供商默认配置（不含 Key）。大多数国产/OpenAI 系模型走 OpenAI 兼容端点。
// 模型名可在设置里编辑——以各家官方为准。
export const DEFAULT_PROVIDERS: Record<ProviderId, Omit<ProviderConfig, "apiKey">> = {
  claude: {
    id: "claude", label: "Claude (Anthropic)", style: "anthropic",
    baseUrl: "https://api.anthropic.com",
    models: ["claude-opus-4-8", "claude-fable-5", "claude-sonnet-5", "claude-haiku-4-5"],
  },
  openai: {
    id: "openai", label: "GPT (OpenAI)", style: "openai",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4.1", "gpt-4o", "gpt-4o-mini"],
  },
  deepseek: {
    id: "deepseek", label: "DeepSeek", style: "openai",
    baseUrl: "https://api.deepseek.com/v1",
    models: ["deepseek-v4-pro", "deepseek-v4-flash"],
  },
  zhipu: {
    id: "zhipu", label: "智谱 GLM", style: "openai",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-plus", "glm-4", "glm-4-air"],
  },
  kimi: {
    id: "kimi", label: "KIMI (Moonshot)", style: "openai",
    baseUrl: "https://api.moonshot.cn/v1",
    models: ["moonshot-v1-32k", "moonshot-v1-128k"],
  },
  mock: {
    id: "mock", label: "Mock（无 Key 演示）", style: "openai",
    baseUrl: "", models: ["mock-1"],
  },
};
