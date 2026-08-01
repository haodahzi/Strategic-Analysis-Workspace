import { ChatRequest, HttpSpec, LLMClient, LLMResult, ProviderConfig, ProviderStyle } from "./types";

// 纯整形：统一 ChatRequest → 各家 HTTP 规格（可单测，不发请求）。
export function buildHttp(cfg: ProviderConfig, req: ChatRequest): HttpSpec {
  // 容错：模型名若误含逗号/顿号（历史配置把多个模型粘一起），只取第一个。
  const model = (req.model || "").split(/[,，、]+/)[0].trim();
  if (cfg.style === "anthropic") {
    return {
      url: `${cfg.baseUrl}/v1/messages`,
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey ?? "",
        "anthropic-version": "2023-06-01",
        // Tauri 第二段改走 tauri-http；浏览器直连需此头
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: {
        model,
        max_tokens: req.maxTokens ?? 8000,
        ...(req.system ? { system: req.system } : {}),
        messages: req.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role, content: m.content })),
        ...(req.jsonSchema ? { output_config: { format: { type: "json_schema", schema: req.jsonSchema } } } : {}),
      },
    };
  }
  // OpenAI 兼容（GPT / DeepSeek / 智谱 / KIMI）
  const messages = req.system ? [{ role: "system", content: req.system }, ...req.messages] : req.messages;
  return {
    url: `${cfg.baseUrl}/chat/completions`,
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey ?? ""}` },
    body: {
      model,
      max_tokens: req.maxTokens ?? 8000,
      messages,
      // 传入 jsonSchema 时的通用退化：走 JSON mode（非 Anthropic 系模型）
      ...(req.jsonSchema ? { response_format: { type: "json_object" } } : {}),
    },
  };
}

// 纯解析：各家响应 JSON → 文本（可单测）。
export function parseResponse(style: ProviderStyle, json: unknown): string {
  const j = json as Record<string, unknown>;
  if (style === "anthropic") {
    const blocks = (j?.content as Array<{ type: string; text?: string }>) ?? [];
    return blocks.filter((b) => b.type === "text").map((b) => b.text ?? "").join("");
  }
  const choices = j?.choices as Array<{ message?: { content?: string } }> | undefined;
  return choices?.[0]?.message?.content ?? "";
}

// 是否命中输出上限被截断（需续写）。anthropic: stop_reason=max_tokens；openai: finish_reason=length。
export function parseTruncated(style: ProviderStyle, json: unknown): boolean {
  const j = json as Record<string, unknown>;
  if (style === "anthropic") return j?.stop_reason === "max_tokens";
  const choices = j?.choices as Array<{ finish_reason?: string }> | undefined;
  return choices?.[0]?.finish_reason === "length";
}

function mockClient(): LLMClient {
  return {
    async send(): Promise<LLMResult> {
      return { text: "OK（Mock 演示提供商——连通性正常）" };
    },
  };
}

/** 由配置生成客户端。fetchImpl 可注入（第二段替换为 tauri-http）。 */
export function makeClient(cfg: ProviderConfig, fetchImpl: typeof fetch = fetch): LLMClient {
  if (cfg.id === "mock") return mockClient();
  return {
    async send(req: ChatRequest): Promise<LLMResult> {
      const spec = buildHttp(cfg, req);
      const res = await fetchImpl(spec.url, {
        method: "POST",
        headers: spec.headers,
        body: JSON.stringify(spec.body),
      });
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`${cfg.label} ${res.status} ${detail.slice(0, 200)}`);
      }
      const json = await res.json();
      return { text: parseResponse(cfg.style, json), raw: json, truncated: parseTruncated(cfg.style, json) };
    },
  };
}
