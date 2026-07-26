import { useEffect, useState } from "react";
import { Analysis } from "../types";
import { generateStep0, Step0Input, step0Route } from "../llm/orchestrate";
import Markdown from "./Markdown";

export default function Step0({ analysis, onBack }: { analysis: Analysis; onBack: () => void }) {
  const [input, setInput] = useState<Step0Input>({ industry: analysis.industry, ourRole: analysis.ourRole, lightScan: "" });
  const [md, setMd] = useState<string | null>(null);
  const [meta, setMeta] = useState<{ label: string; model: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const route = step0Route();

  const run = async () => {
    setBusy(true); setErr("");
    try {
      const r = await generateStep0(input);
      setMd(r.markdown);
      setMeta({ label: r.providerLabel, model: r.model });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // 仅 Mock（无 Key）时自动演示一次；真实模型需点「生成」以免误耗 token。
  useEffect(() => {
    if (route.isMock && !md) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (p: Partial<Step0Input>) => setInput((v) => ({ ...v, ...p }));

  return (
    <div className="report-view">
      <div className="report-bar">
        <button type="button" className="app-btn ghost" onClick={onBack}>← 返回工作区</button>
        <div className="report-bar-title">
          定框 · {input.industry} · 行业研究框架
          <span className="report-bar-tag">投研级框架 · 待审</span>
        </div>
        <div className="report-bar-actions">
          {meta && <span className="rb-meta">{route.isMock ? "Mock（无 Key）" : `${meta.label} · ${meta.model}`}</span>}
        </div>
      </div>

      <div className="dash">
        <div className="set-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <label className="fld"><span>行业</span>
            <input className="key-input wide" value={input.industry} onChange={(e) => set({ industry: e.target.value })} />
          </label>
          <label className="fld"><span>我方角色</span>
            <input className="key-input wide" value={input.ourRole} onChange={(e) => set({ ourRole: e.target.value })} />
          </label>
          <label className="fld"><span>轻扫信息（可选）</span>
            <textarea className="key-input wide" rows={2} value={input.lightScan} onChange={(e) => set({ lightScan: e.target.value })} placeholder="对这行业已知的零碎信息…" />
          </label>
          <div>
            <button type="button" className="app-btn" onClick={run} disabled={busy}>
              {busy ? "生成中…" : md ? "重新生成" : "生成行业研究框架"}
            </button>
            {route.isMock && <span className="set-hint" style={{ marginLeft: 10 }}>当前 Mock 演示；到设置为「定框」配置真实模型即真生成本行业框架。</span>}
          </div>
        </div>

        {err && <div className="pr-finding red" style={{ marginTop: 12 }}><div className="pr-finding-tag">出错</div><p>{err}</p></div>}

        {md && (
          <div className="rp-realwrap">
            <div className="pipe-done-tag">✓ 行业框架（待审）· 本质 / 需求 / 格局 / 价值链利润池 / 盈利公式 / 护城河 / 周期 / 命门 / 对我方含义；确认后据此做「调研前」深度分析</div>
            <div className="rp-realbody"><Markdown text={md} /></div>
          </div>
        )}
      </div>
    </div>
  );
}
