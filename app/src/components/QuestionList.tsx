import { QItem } from "../types";

const INTENTS: QItem["intent"][] = ["要查", "要问对方", "待搞清"];

// 洽谈重点清单 —— 全条目可编辑（#6）：改文字/意图、增删、标 deal-breaker、洽谈中回填答案。
// onGenerate 存在时露出「一键生成」（#5），由父组件负责调模型。
export default function QuestionList(
  { items, onChange, mode, onGenerate, generating }:
  { items: QItem[]; onChange: (next: QItem[]) => void; mode: "编辑" | "核对"; onGenerate?: () => void; generating?: boolean },
) {
  const upd = (id: string, p: Partial<QItem>) => onChange(items.map((q) => (q.id === id ? { ...q, ...p } : q)));
  const del = (id: string) => onChange(items.filter((q) => q.id !== id));
  const add = () => onChange([...items, { id: "q-" + Date.now().toString(36), text: "", intent: "要问对方" }]);

  // deal-breaker 置顶；核对模式下已答沉底
  const sorted = [...items].sort((a, b) =>
    (Number(!!b.dealBreaker) - Number(!!a.dealBreaker)) || (Number(!!a.answered) - Number(!!b.answered)));

  const open = items.filter((q) => !q.answered).length;

  return (
    <div className="ql">
      <div className="ql-head">
        <div>洽谈清单 · <strong>{items.length}</strong> 条{mode === "核对" && <span className="ql-open"> · 待核对 {open}</span>}</div>
        <div className="ql-head-actions">
          {onGenerate && <button type="button" className="app-btn" disabled={generating} onClick={onGenerate}>{generating ? "生成中…" : "✨ 一键生成"}</button>}
          <button type="button" className="app-btn ghost dark" onClick={add}>+ 加一条</button>
        </div>
      </div>

      <ol className="ql-list">
        {sorted.map((q) => (
          <li key={q.id} className={"ql-row" + (q.dealBreaker ? " db" : "") + (q.answered ? " done" : "")}>
            <button
              type="button"
              className={"ql-star" + (q.dealBreaker ? " on" : "")}
              title="标记为「能推翻这单」"
              onClick={() => upd(q.id, { dealBreaker: !q.dealBreaker })}
            >{q.dealBreaker ? "◆" : "◇"}</button>

            <div className="ql-main">
              <input
                className="ql-text"
                value={q.text}
                placeholder="要问 / 要查的具体问题…"
                onChange={(e) => upd(q.id, { text: e.target.value })}
              />
              <div className="ql-meta">
                <select className="ql-intent" value={q.intent} onChange={(e) => upd(q.id, { intent: e.target.value as QItem["intent"] })}>
                  {INTENTS.map((it) => (<option key={it} value={it}>{it}</option>))}
                </select>
                {q.dealBreaker && <span className="ql-badge">能推翻这单</span>}
                <label className="ql-ans">
                  <input type="checkbox" checked={!!q.answered} onChange={(e) => upd(q.id, { answered: e.target.checked })} />
                  已答
                </label>
                <button type="button" className="ql-del" onClick={() => del(q.id)}>删</button>
              </div>
              {(mode === "核对" || q.answered) && (
                <input
                  className="ql-notein"
                  value={q.note ?? ""}
                  placeholder="回填：对方怎么说 / 查到什么（证据、口径）…"
                  onChange={(e) => upd(q.id, { note: e.target.value })}
                />
              )}
            </div>
          </li>
        ))}
      </ol>
      {items.length === 0 && <div className="set-hint">清单为空——{onGenerate ? "点「✨ 一键生成」由 AI 按本单情形提炼重点（有深度分析会更贴命门），" : ""}或「+ 加一条」自己写。</div>}
    </div>
  );
}
