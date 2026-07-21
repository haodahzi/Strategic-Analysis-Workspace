/*
 * 工作台外壳（第一段骨架）。
 * 目前渲染"设计系统样张"以验证 report.css 组件库可用、可截图、可打印。
 * 后续里程碑用真实的阶段产出（Step 0 / 行业分析 / 合作备忘）替换样张区。
 */
export default function App() {
  return (
    <div className="app-root">
      {/* 工作台 chrome：打印/导出时隐藏（.app-chrome + @media print） */}
      <header className="app-chrome">
        <div className="app-brand">
          <span className="app-logo">◆</span>
          <div>
            <div className="app-title">业务项目对接工作台</div>
            <div className="app-sub">决策副驾 · M1 Web 内核骨架</div>
          </div>
        </div>
        <nav className="app-actions">
          <button type="button" className="app-btn">新建项目</button>
          <button type="button" className="app-btn ghost">设置</button>
        </nav>
      </header>

      {/* 交付物渲染区：一律包在 .report 内，隔离工作台样式，便于原样导出 */}
      <main className="report" id="deliverable">
        <div className="wrap">
          <div className="hero">
            <div className="eyebrow">设计系统样张 · 来自参考样例 · 用于验证导出组件库</div>
            <h1 className="hero-h">
              判断的样子：<em>亮结论当靶子，邀请你反驳</em>
            </h1>
            <div className="hero-sub">
              这块区域是所有交付物（行业分析 / 合作备忘 / 判断卡片 / 交易结构图）的统一渲染容器。
              下面几组组件将直接用于真实产出，并原样导出为 HTML / PDF / Word。
            </div>
            <div className="hero-badges">
              <span className="badge">口径透明 · 标来源与不确定性</span>
              <span className="badge">评估阶段只出问题 · 不出分</span>
              <span className="badge">判断为待审初稿 · 可推翻</span>
            </div>
          </div>

          <div className="chapter">
            <div className="ch-hd">
              <div className="ch-n">01</div>
              <div className="ch-meta">
                <div className="ch-label">JUDGMENT CARD</div>
                <div className="ch-title">判断卡片：四段结构（样张）</div>
              </div>
            </div>

            <div className="sub-tag">关键数字（示意 · card-sub 标口径）</div>
            <div className="g4">
              <div className="card">
                <div className="card-tag">战略匹配</div>
                <div className="card-val teal">中—高</div>
                <div className="card-sub">与既有布局重叠度高，口径：内部访谈</div>
              </div>
              <div className="card">
                <div className="card-tag">关键前提</div>
                <div className="card-val gold">3 条</div>
                <div className="card-sub">其中 1 条 deal-breaker</div>
              </div>
              <div className="card">
                <div className="card-tag">把握度</div>
                <div className="card-val">中</div>
                <div className="card-sub">对方财务数据未核实</div>
              </div>
              <div className="card">
                <div className="card-tag">合规红灯</div>
                <div className="card-val red">待检</div>
                <div className="card-sub">四流结构未成形</div>
              </div>
            </div>

            <div className="insight gold">
              <div className="insight-tag">立场 · 有理由，不和稀泥</div>
              <p>
                <strong>倾向"缓"</strong>：战略与能力匹配尚可，但对方履约资质与真实需求两端确定性不足，
                建议先验证再推进，而非直接立项或直接放弃。
              </p>
            </div>

            <div className="chk">
              <div className="chk-row">
                <div className="chk-box">01</div>
                <div className="chk-c">
                  <div className="chk-q">对方"实力资质"只有口头说明，无财务/征信/履约凭证？</div>
                  <div className="chk-r">壳公司毁约、名实分离的高发前置信号——列为最高优先待验证。</div>
                </div>
              </div>
              <div className="chk-row">
                <div className="chk-box">02</div>
                <div className="chk-c">
                  <div className="chk-q">收款主体与签约主体是否一致？（合同流待补）</div>
                  <div className="chk-r">若不一致 → 代收代付 / 走单 / 虚开风险，需叠合同流探测。</div>
                </div>
              </div>
            </div>

            <div className="verdict">
              <div className="verdict-t">判断初稿 · 待你审改（哪条前提错了，这个结论就翻）</div>
              <div className="v-item">
                <span className="v-tag bull">利多</span>
                <div className="v-text">
                  <strong>战略匹配度高</strong>：落入既有业务布局，协同筹码清晰。
                </div>
              </div>
              <div className="v-item">
                <span className="v-tag bear">利空</span>
                <div className="v-text">
                  <strong>对方需求真实性存疑</strong>：下游消纳方未指名，可能是过桥转租。
                </div>
              </div>
              <div className="v-item">
                <span className="v-tag note">存疑 · falsifier</span>
                <div className="v-text">
                  若<strong>对方能出具真实大客户长约</strong>，则"缓"翻为"做"；
                  若<strong>四流叠合同流后主体对不上</strong>，则翻为"弃"。
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
