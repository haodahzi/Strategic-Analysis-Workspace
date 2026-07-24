import { useState } from "react";
import { Analysis } from "../types";
import { mockReport } from "../llm/pipeline";
import { sampleTx } from "../data/tx-sample";

type Verdict = "做" | "缓" | "弃";
const VERDICTS: Verdict[] = ["做", "缓", "弃"];

interface Judgment { stance: string; grounds: string[]; confidence: "高" | "中" | "低"; falsifiers: string[]; }

// 洽谈后·项目报告 = 可行性判断卡（可编辑#6）+ 交易结构·四流（并入本报告#5）+ 定调。
export default function ProjectReport({ analysis }: { analysis: Analysis }) {
  const seed = mockReport({ industry: analysis.industry, ourRole: analysis.ourRole, focus: analysis.focus ?? "项目可行性" }).judgment;
  const [j, setJ] = useState<Judgment>({ stance: seed.stance, grounds: [...seed.grounds], confidence: seed.confidence, falsifiers: [...seed.falsifiers] });
  const [verdict, setVerdict] = useState<Verdict>("缓");
  const [verdictReason, setVerdictReason] = useState("关键前提未确认、尽调未补齐前，建议缓一缓再定。");
  const [revInput, setRevInput] = useState("");
  const [revs, setRevs] = useState<{ at: string; note: string }[]>([]);

  const partyName = (id: string) => sampleTx.parties.find((p) => p.id === id)?.name ?? id;

  const editList = (key: "grounds" | "falsifiers", i: number, v: string) =>
    setJ((s) => ({ ...s, [key]: s[key].map((x, k) => (k === i ? v : x)) }));
  const addTo = (key: "grounds" | "falsifiers") => setJ((s) => ({ ...s, [key]: [...s[key], ""] }));
  const delFrom = (key: "grounds" | "falsifiers", i: number) => setJ((s) => ({ ...s, [key]: s[key].filter((_, k) => k !== i) }));

  const reassess = () => {
    if (!revInput.trim()) return;
    setRevs((r) => [...r, { at: new Date().toISOString().slice(0, 16).replace("T", " "), note: revInput.trim() }]);
    // Mock 重估：补入信息后把握度上调一档（真实版重跑判断链）
    setJ((s) => ({ ...s, confidence: s.confidence === "低" ? "中" : "高" }));
    setRevInput("");
  };
  const restore = () => setJ({ stance: seed.stance, grounds: [...seed.grounds], confidence: seed.confidence, falsifiers: [...seed.falsifiers] });

  return (
    <div className="pr-report">
      <div className="pr-top">
        <div>
          <h2>项目报告 · 定调</h2>
        </div>
        <div className="pr-verdict-pick">
          {VERDICTS.map((v) => (
            <button key={v} type="button" className={"pr-vbtn v-" + v + (verdict === v ? " on" : "")} onClick={() => setVerdict(v)}>{v}</button>
          ))}
        </div>
      </div>

      {/* 定调 */}
      <div className={"pr-verdict-banner v-" + verdict}>
        <div className="pr-vb-tag">定调 · {verdict === "做" ? "推进" : verdict === "缓" ? "缓一缓 / 补条件" : "不做 / 退出"}</div>
        <textarea className="pr-vb-reason" value={verdictReason} onChange={(e) => setVerdictReason(e.target.value)} />
      </div>

      {/* 可行性判断卡（可编辑 #6） */}
      <div className="sec-head">可行性判断卡 · 可编辑（立场 / 依据 / 把握度 / falsifiers）</div>
      <div className="pr-card">
        <label className="pr-field"><span>立场 / 倾向</span>
          <input className="key-input wide" value={j.stance} onChange={(e) => setJ((s) => ({ ...s, stance: e.target.value }))} />
        </label>

        <div className="pr-field"><span>依据</span>
          {j.grounds.map((g, i) => (
            <div key={i} className="pr-line">
              <input className="key-input wide" value={g} onChange={(e) => editList("grounds", i, e.target.value)} />
              <button type="button" className="ql-del" onClick={() => delFrom("grounds", i)}>删</button>
            </div>
          ))}
          <button type="button" className="pr-add" onClick={() => addTo("grounds")}>+ 加依据</button>
        </div>

        <label className="pr-field"><span>把握度</span>
          <select className="set-select" value={j.confidence} onChange={(e) => setJ((s) => ({ ...s, confidence: e.target.value as Judgment["confidence"] }))}>
            {["高", "中", "低"].map((c) => (<option key={c} value={c}>{c}</option>))}
          </select>
        </label>

        <div className="pr-field"><span>falsifiers · 哪条错了这结论就翻</span>
          {j.falsifiers.map((f, i) => (
            <div key={i} className="pr-line">
              <input className="key-input wide" value={f} onChange={(e) => editList("falsifiers", i, e.target.value)} />
              <button type="button" className="ql-del" onClick={() => delFrom("falsifiers", i)}>删</button>
            </div>
          ))}
          <button type="button" className="pr-add" onClick={() => addTo("falsifiers")}>+ 加 falsifier</button>
        </div>

        <div className="pr-reassess">
          <input className="key-input wide" value={revInput} placeholder="补充新信息 → 让 AI 据此重估（如：已拿到租户履约流水）" onChange={(e) => setRevInput(e.target.value)} />
          <button type="button" className="app-btn" onClick={reassess}>补充并重估</button>
          <button type="button" className="app-btn ghost dark" onClick={restore}>恢复 AI 初稿</button>
        </div>
        {revs.length > 0 && (
          <div className="pr-revs">
            <div className="pr-revs-t">修改留痕</div>
            {revs.map((r, i) => (<div key={i} className="pr-rev">· <span className="pr-rev-at">{r.at}</span> {r.note}</div>))}
          </div>
        )}
      </div>

      {/* 交易框架（并入项目报告 #5；此阶段只到框架，四流合规探测留到需要时再上） */}
      <div className="sec-head">交易框架</div>
      {analysis.hasIndustryReport ? (
        <div className="pr-tx">
          <table className="rp-table">
            <thead><tr><th>从</th><th>给出 / 内容</th><th>到</th></tr></thead>
            <tbody>
              {sampleTx.flows.map((f) => (
                <tr key={f.id}>
                  <td>{partyName(f.from)}</td>
                  <td><span className="pr-flowtype">{f.type}</span> {f.instrument ?? "—"}{f.amount ? `（${f.amount} 万元）` : ""}</td>
                  <td>{partyName(f.to)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="pr-tx"><p className="set-hint">尚无交易框架——洽谈后据实录入这单的资金 / 货物 / 合同怎么走。</p></div>
      )}
    </div>
  );
}
