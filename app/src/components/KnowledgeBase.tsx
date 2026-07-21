import { kbIndustry, kbEnterprise } from "../data/seed";

export default function KnowledgeBase({ onOpenSample }: { onOpenSample: () => void }) {
  return (
    <div className="dash">
      <div className="dash-head">
        <h2>交付物库 · 知识库</h2>
        <div className="dash-sub">半耐用交付物：行业分析、企业画像。周期更新、跨项目复用——知识库的复利价值主要在这两类。</div>
      </div>

      <div className="sec-head">行业深度分析（半耐用 · 框架耐用/内容半耐用）</div>
      <div className="kb-list">
        {kbIndustry.map((k) => (
          <div key={k.id} className="kb-row">
            <div className="kb-row-main">
              <span className="kb-row-title">{k.industry}</span>
              <span className="kb-ver">v{k.version}</span>
              {k.hasSample && <span className="kb-tag">对齐算力租赁深度基准</span>}
            </div>
            <div className="kb-row-r">
              <span className="kb-up">更新 {k.updatedAt}</span>
              {k.hasSample && <button type="button" className="app-btn ghost" onClick={onOpenSample}>查看</button>}
            </div>
          </div>
        ))}
      </div>

      <div className="sec-head">企业画像（半耐用 · 同一家再来可复用）</div>
      <div className="kb-list">
        {kbEnterprise.map((k) => (
          <div key={k.id} className="kb-row">
            <div className="kb-row-main">
              <span className="kb-row-title">{k.company}</span>
              <span className="kb-ver">v{k.version}</span>
            </div>
            <div className="kb-row-r"><span className="kb-up">更新 {k.updatedAt}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}
