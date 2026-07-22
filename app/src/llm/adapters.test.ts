import { describe, it, expect } from "vitest";
import { buildHttp, parseResponse, makeClient } from "./adapters";
import { ProviderConfig, ChatRequest } from "./types";

const claude: ProviderConfig = { id: "claude", label: "Claude", style: "anthropic", baseUrl: "https://api.anthropic.com", apiKey: "sk-a", models: ["claude-opus-4-8"] };
const deepseek: ProviderConfig = { id: "deepseek", label: "DeepSeek", style: "openai", baseUrl: "https://api.deepseek.com/v1", apiKey: "sk-d", models: ["deepseek-chat"] };
const req: ChatRequest = { model: "m", system: "你是决策副驾", messages: [{ role: "user", content: "定框" }], maxTokens: 100 };

describe("多模型适配 · 请求整形", () => {
  it("Anthropic：/v1/messages + x-api-key + system 顶层 + 过滤 system 消息", () => {
    const s = buildHttp(claude, req);
    expect(s.url).toBe("https://api.anthropic.com/v1/messages");
    expect(s.headers["x-api-key"]).toBe("sk-a");
    expect(s.headers["anthropic-version"]).toBe("2023-06-01");
    const b = s.body as Record<string, unknown>;
    expect(b.system).toBe("你是决策副驾");
    expect(b.max_tokens).toBe(100);
    expect((b.messages as unknown[]).length).toBe(1);
  });

  it("Anthropic：jsonSchema → output_config.format", () => {
    const s = buildHttp(claude, { ...req, jsonSchema: { type: "object" } });
    const b = s.body as Record<string, unknown>;
    expect(b.output_config).toBeTruthy();
  });

  it("OpenAI 兼容：/chat/completions + Bearer + system 合并进 messages", () => {
    const s = buildHttp(deepseek, req);
    expect(s.url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(s.headers.authorization).toBe("Bearer sk-d");
    const b = s.body as { messages: Array<{ role: string }> };
    expect(b.messages[0].role).toBe("system");
    expect(b.messages.length).toBe(2);
  });

  it("OpenAI 兼容：jsonSchema → response_format json_object", () => {
    const s = buildHttp(deepseek, { ...req, jsonSchema: { type: "object" } });
    const b = s.body as Record<string, unknown>;
    expect(b.response_format).toEqual({ type: "json_object" });
  });

  it("响应解析：anthropic content blocks / openai choices", () => {
    expect(parseResponse("anthropic", { content: [{ type: "text", text: "甲" }, { type: "thinking", text: "x" }] })).toBe("甲");
    expect(parseResponse("openai", { choices: [{ message: { content: "乙" } }] })).toBe("乙");
  });

  it("Mock 客户端连通", async () => {
    const c = makeClient({ id: "mock", label: "Mock", style: "openai", baseUrl: "", models: ["mock-1"] });
    const r = await c.send(req);
    expect(r.text).toContain("Mock");
  });

  it("makeClient 用注入的 fetch 发 anthropic 请求并解析", async () => {
    const fakeFetch = (async (_url: string, init: RequestInit) => {
      const body = JSON.parse(init.body as string);
      expect(body.model).toBe("m");
      return { ok: true, json: async () => ({ content: [{ type: "text", text: "已生成" }] }) } as Response;
    }) as unknown as typeof fetch;
    const c = makeClient(claude, fakeFetch);
    const r = await c.send(req);
    expect(r.text).toBe("已生成");
  });
});
