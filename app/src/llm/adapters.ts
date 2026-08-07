import { ChatRequest, HttpSpec, LLMClient, LLMResult, ProviderConfig, ProviderStyle } from "./types";

// 纯整形：统一 ChatRequest → 各家 HTTP 规格（可单测，不发请求）。
export function buildHttp(cfg: ProviderConfig, req: ChatRequest): HttpSpec {
  // 容错：模型名若误含逗号/顿号（历史配置把多个模型粘一起），只取第一个。
  const model = (req.model || "").split(/[,，、]+/)[0].trim();
  const imgs = req.images ?? [];
  // 把图片挂到最后一条 user 消息上（多模态）
  const isLastUser = (arr: { role: string }[], i: number, role: string) => role === "user" && i === arr.length - 1;

  if (cfg.style === "anthropic") {
    const msgs = req.messages.filter((m) => m.role !== "system");
    const messages = msgs.map((m, i) => ({
      role: m.role,
      content: imgs.length && isLastUser(msgs, i, m.role)
        ? [{ type: "text", text: m.content }, ...imgs.map((u) => ({ type: "image", source: { type: "base64", media_type: "image/png", data: u.replace(/^data:[^,]+,/, "") } }))]
        : m.content,
    }));
    return {
      url: `${cfg.baseUrl}/v1/messages`,
      headers: {
        "content-type": "application/json",
        "x-api-key": cfg.apiKey ?? "",
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-direct-browser-access": "true",
      },
      body: {
        model,
        max_tokens: req.maxTokens ?? 8000,
        ...(req.system ? { system: req.system } : {}),
        messages,
        ...(req.jsonSchema ? { output_config: { format: { type: "json_schema", schema: req.jsonSchema } } } : {}),
      },
    };
  }
  // OpenAI 兼容（GPT / DeepSeek / 智谱 / KIMI / 通义）
  const base = req.system ? [{ role: "system", content: req.system }, ...req.messages] : req.messages;
  const messages = base.map((m, i) => ({
    role: m.role,
    content: imgs.length && isLastUser(base, i, m.role)
      ? [{ type: "text", text: m.content }, ...imgs.map((u) => ({ type: "image_url", image_url: { url: u } }))]
      : m.content,
  }));
  return {
    url: `${cfg.baseUrl}/chat/completions`,
    headers: { "content-type": "application/json", authorization: `Bearer ${cfg.apiKey ?? ""}` },
    body: {
      model,
      max_tokens: req.maxTokens ?? 8000,
      messages,
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
      // 请求超时保护：某些模型 / 网络下连接会挂死，await 永不返回 → 流水线该步一直「进行中」卡住不动。
      // 150s 无响应即中止，转成可重试的报错（用户可点「继续」从该步接着跑）。
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 150000);
      let res: Response;
      try {
        res = await fetchImpl(spec.url, {
          method: "POST",
          headers: spec.headers,
          body: JSON.stringify(spec.body),
          signal: ctrl.signal,
        });
      } catch (e) {
        if ((e as Error)?.name === "AbortError") throw new Error(`${cfg.label} 请求超时（150s 无响应）——网络或该模型响应过慢，点「继续」重试或换一款模型`);
        throw e;
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        throw new Error(`${cfg.label} ${res.status} ${detail.slice(0, 200)}`);
      }
      const json = await res.json();
      return { text: parseResponse(cfg.style, json), raw: json, truncated: parseTruncated(cfg.style, json) };
    },
  };
}
