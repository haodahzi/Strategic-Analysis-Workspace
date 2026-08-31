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

  it("多模态：带 images 时，最后一条 user 消息 content 变成 文本+图片 数组（两种风格）", () => {
    const vreq: ChatRequest = { model: "m", messages: [{ role: "user", content: "读这页" }], images: ["data:image/png;base64,AAAA"] };
    const a = buildHttp(claude, vreq).body as { messages: { content: unknown }[] };
    const ac = a.messages[0].content as Array<Record<string, unknown>>;
    expect(Array.isArray(ac)).toBe(true);
    expect(ac[0]).toMatchObject({ type: "text", text: "读这页" });
    expect(ac[1]).toMatchObject({ type: "image", source: { type: "base64", media_type: "image/png", data: "AAAA" } });   // 去掉 data: 前缀
    const o = buildHttp(deepseek, vreq).body as { messages: { content: unknown }[] };
    const oc = o.messages[o.messages.length - 1].content as Array<Record<string, unknown>>;
    expect(oc[1]).toMatchObject({ type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } });
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

  it("disableThinking：仅 DeepSeek 关思考——openai 加 chat_template_kwargs、anthropic 加 thinking:disabled；别家不加", () => {
    const o = buildHttp(deepseek, { ...req, disableThinking: true }).body as Record<string, unknown>;
    expect(o.chat_template_kwargs).toEqual({ thinking: false });
    const dsAnthropic: ProviderConfig = { ...deepseek, style: "anthropic", baseUrl: "https://api.deepseek.com/anthropic" };
    const a = buildHttp(dsAnthropic, { ...req, disableThinking: true }).body as Record<string, unknown>;
    expect(a.thinking).toEqual({ type: "disabled" });
    const other: ProviderConfig = { ...deepseek, id: "openai" };
    const oo = buildHttp(other, { ...req, disableThinking: true }).body as Record<string, unknown>;
    expect(oo.chat_template_kwargs).toBeUndefined();
  });

  it("响应解析：openai 正文空时回退 reasoning_content（思考模型）", () => {
    expect(parseResponse("openai", { choices: [{ message: { content: "", reasoning_content: "{\"a\":1}" } }] })).toBe("{\"a\":1}");
    expect(parseResponse("openai", { choices: [{ message: { content: "正文", reasoning_content: "思考" } }] })).toBe("正文");
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
