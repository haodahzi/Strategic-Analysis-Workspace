import { useEffect, useState } from "react";
import { Analysis } from "../types";
import { generateStep0, Step0Framework, Step0Input, step0Route } from "../llm/orchestrate";

export default function Step0({ analysis, onBack }: { analysis: Analysis; onBack: () => void }) {
  const [input, setInput] = useState<Step0Input>({ industry: analysis.industry, ourRole: analysis.ourRole, lightScan: "" });
  const [fw, setFw] = useState<Step0Framework | null>(null);
  const [meta, setMeta] = useState<{ label: string; model: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const run = async () => {
    setBusy(true); setErr("");
    try {
      const r = await generateStep0(input);
      setFw(r.framework);
      setMeta({ label: r.providerLabel, model: r.model });
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // 仅当路由到 Mock（无 Key）时自动演示一次；真实模型需点"生成"以免误耗 token。
  useEffect(() => {
    if (step0Route().isMock && !fw) void run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const set = (p: Partial<Step0Input>) => setInput((v) => ({ ...v, ...p }));

  return (
    <div className="report-view">
      <div className="report-bar">
        <button type="button" className="app-btn ghost" onClick={onBack}>← 返回工作区</button>
        <div className="report-bar-title">
          Step 0 · 定框 · {analysis.industry}
          <span className="report-bar-tag">评估框架 · 待审初稿</span>
        </div>
        <div className="report-bar-actions">
          {meta && <span className="rb-meta">{meta.label} · {meta.model}</span>}
        </div>
      </div>

      <div className="dash">
        <div className="sec-head">输入</div>
        <div className="set-row" style={{ flexDirection: "column", alignItems: "stretch", gap: 10 }}>
          <label className="fld"><span>行业</span>
            <input className="key-input wide" value={input.industry} onChange={(e) => set({ industry: e.target.value })} />
          </label>
          <label className="fld"><span>我方角色</span>
            <input className="key-input wide" value={input.ourRole} onChange={(e) => set({ ourRole: e.target.value })} />
          </label>
          <label className="fld"><span>轻扫信息（可选）</span>
            <textarea className="key-input wide" rows={3} value={input.lightScan} onChange={(e) => set({ lightScan: e.target.value })} placeholder="对这单已知的零碎信息…" />
          </label>
          <div>
            <button type="button" className="app-btn ghost dark" onClick={run} disabled={busy}>
              {busy ? "生成中…" : fw ? "重新生成" : "生成评估框架"}
            </button>
            {step0Route().isMock && <span className="set-hint" style={{ marginLeft: 10 }}>当前路由到 Mock（无 Key 演示）；在设置里为"定框"选真实模型即真生成。</span>}
          </div>
        </div>

        {err && <div className="anno red" style={{ marginTop: 14 }}><div className="anno-tag">出错</div><p>{err}</p></div>}

        {fw && (
          <div className="report" style={{ marginTop: 8 }}>
            <div className="wrap" style={{ padding: 0 }}>
              <div className="sec-t">核心层 6 维 · 按我方角色排权重（判断初稿，可推翻）</div>
              {fw.coreDimensions.map((d) => (
                <div key={d.key} className="mrow">
                  <span className="mrow-name">{d.key}</span>
                  <div className="mrow-bar"><div className="mrow-fill" style={{ width: `${Math.max(0, Math.min(100, d.weight))}%`, background: "var(--gold)" }} /></div>
                  <span className="mrow-val">{d.weight}</span>
                </div>
              ))}
              <div className="g2" style={{ marginTop: 14 }}>
                {fw.coreDimensions.map((d) => (
                  <div key={d.key} className="card">
                    <div className="card-tag">{d.key} · 权重 {d.weight}</div>
                    <div className="card-body">{d.weightReason}</div>
                  </div>
                ))}
              </div>

              <div className="sec-t">行业叠加层建议（带理由）</div>
              {fw.industryOverlay.map((o, i) => (
                <div key={i} className="anno gold"><div className="anno-tag">{o.item}</div><p>{o.reason}</p></div>
              ))}

              <div className="insight dark" style={{ marginTop: 16 }}>
                <div className="insight-tag">内建反问 · 这框架对本行业可能漏了什么</div>
                {fw.reflexive.map((r, i) => (<p key={i}>· {r}</p>))}
              </div>

              <div className="anno teal" style={{ marginTop: 14 }}>
                <div className="anno-tag">下一步</div>
                <p>这是<strong>活草稿</strong>：你可增删维度、改权重、驳回反问；框架确认后进入「调研前」，据此产出行业深度分析与前提假设。</p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
