import { useRef } from "react";
import { Analysis } from "../types";
import { FlowType, Party, RiskFinding, runComplianceRules, TxStructure } from "../domain/tx";
import { exportReport } from "../export/exporter";

const FLOW_ORDER: FlowType[] = ["合同流", "资金流", "货物服务流", "票流"];
const FLOW_COLOR: Record<FlowType, string> = {
  合同流: "var(--purple)", 资金流: "var(--gold)", 货物服务流: "var(--blue)", 票流: "var(--teal)",
};

function partyName(tx: TxStructure, id: string) {
  return tx.parties.find((p) => p.id === id)?.name ?? id;
}

export default function TxComplianceView({ tx, project, onBack }: { tx: TxStructure; project: Analysis; onBack: () => void }) {
  const reportRef = useRef<HTMLDivElement>(null);
  const title = `交易结构合规·${project.industry}`;
  const findings: RiskFinding[] = runComplianceRules(tx);
  const red = findings.filter((f) => f.level === "红").length;
  const yellow = findings.filter((f) => f.level === "黄").length;

  return (
    <div className="report-view">
      <div className="report-bar">
        <button type="button" className="app-btn ghost" onClick={onBack}>← 返回工作区</button>
        <div className="report-bar-title">
          交易结构图 · 合规探测 · {project.industry}
          <span className="report-bar-tag">合作备忘收口件</span>
        </div>
        <div className="report-bar-actions">
          <button type="button" className="app-btn" onClick={() => exportReport(reportRef.current, title, "word")}>导出 Word</button>
          <button type="button" className="app-btn ghost" onClick={() => exportReport(reportRef.current, title, "pdf")}>导出 PDF</button>
        </div>
      </div>

      <div className="report" ref={reportRef}>
        <div className="wrap">
          <div className="hero" style={{ padding: "34px 0 24px" }}>
            <div className="eyebrow">交易结构 · 四流探测 · 确定性规则 R1–R7</div>
            <h1 className="hero-h" style={{ fontSize: 30 }}>
              四流叠合同流，<em>{red > 0 ? "已亮红灯" : "暂无红灯"}</em>
            </h1>
            <div className="hero-sub">
              AI 从洽谈会议记录抽出四流结构，确定性规则跑一遍报红/黄灯，再就每个红灯给判断卡片（此处规则为纯确定性，可复核、可回归测试）。
            </div>
            <div className="hero-badges">
              <span className="badge" style={{ color: "var(--red)", borderColor: "var(--red)" }}>红灯 {red}</span>
              <span className="badge" style={{ color: "var(--gold)", borderColor: "var(--gold)" }}>黄灯 {yellow}</span>
              <span className="badge">主体 {tx.parties.length}</span>
              <span className="badge">流 {tx.flows.length}</span>
            </div>
          </div>

          {/* 主体 */}
          <div className="chapter" style={{ marginTop: 30 }}>
            <div className="ch-hd">
              <div className="ch-n">四流</div>
              <div className="ch-meta">
                <div className="ch-label">PARTIES &amp; FLOWS</div>
                <div className="ch-title">主体与四流</div>
              </div>
            </div>

            <div className="sub-tag">主体及其在交易中的角色</div>
            <div className="g2">
              {tx.parties.map((p: Party) => (
                <div key={p.id} className="card">
                  <div className="card-name">{p.name}</div>
                  <div className="tags">
                    {(p.roles ?? []).map((r) => (<span key={r} className="tag">{r}</span>))}
                  </div>
                </div>
              ))}
            </div>

            <div className="sub-tag">四流清单（合同流 / 资金流 / 货物服务流 / 票流）</div>
            <div className="tw">
              <table>
                <thead>
                  <tr><th>流</th><th>从</th><th>工具 / 内容</th><th>到</th></tr>
                </thead>
                <tbody>
                  {FLOW_ORDER.flatMap((ft) =>
                    tx.flows.filter((f) => f.type === ft).map((f) => (
                      <tr key={f.id}>
                        <td><span style={{ color: FLOW_COLOR[ft], fontWeight: 600 }}>{ft}</span></td>
                        <td>{partyName(tx, f.from)}</td>
                        <td>{f.instrument ?? "—"}{f.amount ? `（${f.amount} 万元）` : ""}</td>
                        <td>{partyName(tx, f.to)}</td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
            {tx.timing && (
              <div className="anno gold">
                <div className="anno-tag">时点 / 周期</div>
                <p>锁价：{tx.timing.lockPrice ?? "—"} · 期限：{tx.timing.lockPeriod ?? "—"} · 周期：{tx.timing.marketCycle ?? "—"}</p>
              </div>
            )}
          </div>

          {/* 合规红灯 */}
          <div className="chapter" style={{ marginTop: 40 }}>
            <div className="ch-hd">
              <div className="ch-n">规则</div>
              <div className="ch-meta">
                <div className="ch-label">COMPLIANCE · R1–R7</div>
                <div className="ch-title">合规探测：确定性红/黄灯</div>
              </div>
            </div>

            {findings.length === 0 ? (
              <div className="insight teal"><div className="insight-tag">结果</div><p>四流闭合、主体一致，未触发任何确定性红/黄灯规则。</p></div>
            ) : (
              findings.map((f, i) => (
                <div key={i} className={"anno " + (f.level === "红" ? "red" : "gold")}>
                  <div className="anno-tag">
                    {f.level === "红" ? "⚑ 红灯" : "▲ 黄灯"} · {f.rule} {f.title}
                    {f.parties.length > 0 && <span> · 涉及：{f.parties.join("、")}</span>}
                  </div>
                  <p>{f.reason}</p>
                </div>
              ))
            )}

            <div className="verdict">
              <div className="verdict-t">判断初稿 · 待你审改（AI 就红灯给的解读，可反驳）</div>
              <div className="v-item">
                <span className="v-tag bear">红灯</span>
                <div className="v-text">
                  {red > 0
                    ? "核心风险：收款主体与签约主体不一致（代收代付 / 名实分离），叠合同流后露馅——建议要求资金付至签约主体、或补齐三方协议与代收授权，否则虚开与资金流向风险实质存在。"
                    : "四流当前未触发红灯，但样本信息有限，需以尽调核实为准。"}
                </div>
              </div>
              <div className="v-item">
                <span className="v-tag note">存疑 · falsifier</span>
                <div className="v-text">
                  若<strong>丙方与乙方存在合规的代收代付授权且票流一致</strong>，则该红灯可降级；
                  若<strong>补不齐授权链</strong>，则该结构不宜推进。
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
