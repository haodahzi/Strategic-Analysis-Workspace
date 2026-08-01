import type { IntelligenceBootSnapshot } from "./application/intelligenceBoot";
export type IntelligenceBootStatus = IntelligenceBootSnapshot["status"];

interface IntelligenceFeatureProps {
  boot: IntelligenceBootSnapshot;
  onRetry: () => void;
}

export function IntelligenceFeature({ boot, onRetry }: IntelligenceFeatureProps) {
  const { status } = boot;
  return (
    <section className="intel-feature" aria-labelledby="intelligence-title">
      <div className="intel-heading">
        <p className="intel-kicker">WORKSPACE</p>
        <h1 id="intelligence-title">对标企业情报</h1>
        <p className="intel-description">独立工作区将在本地情报库可用后提供企业对标分析。</p>
      </div>

      {status === "initializing" && (
        <div className="intel-state" aria-live="polite">
          <p>正在检查本地数据</p>
        </div>
      )}
      {status === "ready" && (
        <div className="intel-state" aria-live="polite">
          <p>本地情报库已就绪，尚未执行首次同步。</p>
        </div>
      )}
      {status === "error" && (
        <div className="intel-state intel-state-error" role="alert">
          <p>本地数据检查失败，请重试。</p>
          <button className="intel-retry" type="button" onClick={onRetry}>重试</button>
        </div>
      )}
      {status === "unavailable" && (
        <div className="intel-state" role="status">
          <p>此功能仅在桌面版可用。</p>
        </div>
      )}
    </section>
  );
}
