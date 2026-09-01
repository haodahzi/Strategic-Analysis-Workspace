// [对标情报] 主视图：左侧业务单元栏 + 右侧本月情报流。整块删除见 README.md。
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import "./benchmark.css";
import { EVENT_TYPES, Feedback, IMPORTANCE, IMPORTANCE_RANK, Importance, IntelEvent, curMonth } from "./types";
import { addCompany, getData, hydrate, lastRefresh, patchEvent, removeCompany, setCompany, setUnitName, subscribe } from "./data";
import { refreshUnit } from "./intel";
import { openExternal } from "../sources/browser";

const addMonth = (m: string, d: number): string => { const [y, mo] = m.split("-").map(Number); const dt = new Date(y, mo - 1 + d, 1); return dt.toISOString().slice(0, 7); };
const impClass = (i: Importance) => (i === "重大" ? "imp-hi" : i === "重要" ? "imp-mid" : "imp-lo");

export default function Benchmark() {
  const data = useSyncExternalStore(useCallback((cb) => subscribe(cb), []), getData);
  useEffect(() => { void hydrate(); }, []);

  const [unitId, setUnitId] = useState("u1");
  const [month, setMonth] = useState(curMonth());
  const [fCompany, setFCompany] = useState("");
  const [fType, setFType] = useState("");
  const [fImp, setFImp] = useState("");
  const [q, setQ] = useState("");
  const [ref, setRef] = useState<{ status: "idle" | "running" | "done" | "err"; msg?: string }>({ status: "idle" });
  const [ev, setEv] = useState<IntelEvent | null>(null);   // 证据弹窗
  const [admin, setAdmin] = useState(false);

  const unit = data.units.find((u) => u.id === unitId) ?? data.units[0];
  useEffect(() => { if (!data.units.some((u) => u.id === unitId) && data.units[0]) setUnitId(data.units[0].id); }, [data.units, unitId]);

  const monthEvents = useMemo(() => (unit ? data.events.filter((e) => e.unitId === unit.id && e.month === month) : []), [data.events, unit, month]);
  const shown = useMemo(() => monthEvents
    .filter((e) => (!fCompany || e.companyId === fCompany) && (!fType || e.type === fType) && (!fImp || e.importance === fImp)
      && (!q.trim() || (e.title + e.company + e.facts).includes(q.trim())))
    .sort((a, b) => IMPORTANCE_RANK[b.importance] - IMPORTANCE_RANK[a.importance] || (b.publishTime || b.occurTime || "").localeCompare(a.publishTime || a.occurTime || "")),
    [monthEvents, fCompany, fType, fImp, q]);

  const unread = monthEvents.filter((e) => !e.read).length;
  const majors = monthEvents.filter((e) => e.importance === "重大").length;

  const doRefresh = async () => {
    if (!unit) return;
    const only = fCompany || undefined;   // 「全部企业」下拉选了某家 → 只刷那家
    const backfill = !lastRefresh(unit.id, month);   // 首次该单元该月 → 近7天回填
    setRef({ status: "running", msg: "开始刷新…" });
    try {
      const r = await refreshUnit(unit, month, backfill, (m) => setRef({ status: "running", msg: m }), only);
      setRef({ status: "done", msg: `刷新完成：${r.summary}` });
    } catch (e) { setRef({ status: "err", msg: (e as Error).message.slice(0, 200) }); }
  };

  const markRead = (e: IntelEvent) => { if (!e.read) patchEvent(e.id, { read: true }); };

  return (
    <div className="bm">
      <aside className="bm-units">
        <div className="bm-units-h">对标企业情报</div>
        {data.units.map((u) => {
          const es = data.events.filter((e) => e.unitId === u.id && e.month === month);
          return (
            <button key={u.id} type="button" className={"bm-unit" + (u.id === unit?.id ? " on" : "")} onClick={() => { setUnitId(u.id); setFCompany(""); }}>
              <div className="bm-unit-n">{u.name}</div>
              <div className="bm-unit-m">对标 {u.companies.filter((c) => c.active).length} · 本月 {es.length}{es.some((e) => e.importance === "重大") ? <span className="bm-unit-major"> 重大 {es.filter((e) => e.importance === "重大").length}</span> : ""}</div>
            </button>
          );
        })}
        <button type="button" className="bm-admin-btn" onClick={() => setAdmin((v) => !v)}>{admin ? "← 返回情报" : "⚙ 企业名单维护"}</button>
      </aside>

      <main className="bm-main">
        {!unit ? <div className="bm-empty">加载中…</div> : admin ? (
          <Admin unit={unit} />
        ) : (
          <>
            <div className="bm-head">
              <div>
                <h2>{unit.name}</h2>
                <div className="bm-sub">对标：{unit.companies.filter((c) => c.active).map((c) => c.name).join("、") || "（无）"}</div>
              </div>
              <div className="bm-head-r">
                <div className="bm-month">
                  <button type="button" onClick={() => setMonth((m) => addMonth(m, -1))}>‹</button>
                  <span>{month}</span>
                  <button type="button" disabled={month >= curMonth()} onClick={() => setMonth((m) => addMonth(m, 1))}>›</button>
                </div>
                <button type="button" className="bm-refresh" disabled={ref.status === "running"} onClick={() => void doRefresh()}>
                  {ref.status === "running" ? "刷新中…"
                    : fCompany
                      ? `刷新 ${(unit.companies.find((c) => c.id === fCompany)?.name ?? "").slice(0, 8)}${lastRefresh(unit.id, month) ? "" : "·近7天"}`
                      : lastRefresh(unit.id, month) ? "刷新本月" : "首次刷新（近7天）"}
                </button>
              </div>
            </div>
            <div className="bm-stats">全部 {monthEvents.length} · 重大 {majors} · 未读 {unread}{lastRefresh(unit.id, month) ? ` · 上次刷新 ${lastRefresh(unit.id, month)!.at.slice(5, 16).replace("T", " ")}` : " · 尚未刷新"}</div>
            {ref.status !== "idle" && <div className="bm-refmsg">{ref.status === "err" ? <span className="bm-err">刷新失败：{ref.msg}</span> : ref.msg}</div>}

            <div className="bm-filters">
              <select value={fCompany} onChange={(e) => setFCompany(e.target.value)}><option value="">全部企业</option>{unit.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              <select value={fType} onChange={(e) => setFType(e.target.value)}><option value="">全部类型</option>{EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              <select value={fImp} onChange={(e) => setFImp(e.target.value)}><option value="">全部重要性</option>{IMPORTANCE.map((t) => <option key={t} value={t}>{t}</option>)}</select>
              <input value={q} placeholder="搜索企业或事件…" onChange={(e) => setQ(e.target.value)} />
            </div>

            {monthEvents.length === 0 ? (
              <div className="bm-empty">本月暂未发现重要变化。<div className="bm-empty-s">点右上「{lastRefresh(unit.id, month) ? "刷新本月" : "首次刷新"}」抓取公开信息；私营小企业公开信息少，可能长期无内容。</div></div>
            ) : shown.length === 0 ? (
              <div className="bm-empty">当前筛选无结果。</div>
            ) : (
              <div className="bm-cards">
                {shown.map((e) => (
                  <div key={e.id} className={"bm-card" + (e.read ? " read" : "")} onClick={() => markRead(e)}>
                    <div className="bm-card-top">
                      <span className={"bm-imp " + impClass(e.importance)}>{e.importance}</span>
                      <span className="bm-type">{e.type}</span>
                      <span className="bm-co">{e.company}</span>
                      <span className="bm-time">{e.occurTime || e.publishTime || "时间待核"}</span>
                      {!e.read && <span className="bm-dot" title="未读" />}
                    </div>
                    <div className="bm-title">{e.title}</div>
                    {e.facts && <div className="bm-facts"><b>公开事实</b>{e.facts}</div>}
                    {e.impact && <div className="bm-ai"><span className="bm-aibadge">AI·潜在影响</span>{e.impact}</div>}
                    {e.action && <div className="bm-ai"><span className="bm-aibadge">AI·建议行动</span>{e.action}</div>}
                    <div className="bm-card-foot">
                      <span className="bm-conf">置信度 {e.confidence}{e.confidenceBasis ? `（${e.confidenceBasis}）` : ""}</span>
                      <div className="bm-actions" onClick={(x) => x.stopPropagation()}>
                        <button type="button" onClick={() => setEv(e)}>证据 {e.sources.length}</button>
                        <button type="button" className={e.starred ? "on" : ""} onClick={() => patchEvent(e.id, { starred: !e.starred })}>{e.starred ? "★ 已收藏" : "☆ 收藏"}</button>
                        <button type="button" onClick={() => patchEvent(e.id, { read: !e.read })}>{e.read ? "标未读" : "标已读"}</button>
                        {(["有用", "不相关", "分析不准确"] as Feedback[]).map((f) => (
                          <button key={f} type="button" className={"bm-fb" + (e.feedback === f ? " on" : "")} onClick={() => patchEvent(e.id, { feedback: e.feedback === f ? undefined : f })}>{f}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {ev && (
        <div className="bm-modal" onClick={() => setEv(null)}>
          <div className="bm-modal-in" onClick={(x) => x.stopPropagation()}>
            <div className="bm-modal-h"><b>证据来源 · {ev.company}</b><button type="button" onClick={() => setEv(null)}>关闭</button></div>
            <div className="bm-modal-t">{ev.title}</div>
            {ev.sources.map((s, i) => (
              <div key={i} className="bm-srcrow"><span className="bm-srcname">{s.name}</span><button type="button" className="bm-srclink" onClick={() => void openExternal(s.url, s.name)}>{s.url.slice(0, 80)} ↗</button></div>
            ))}
            <div className="bm-modal-note">事实以来源为准；「潜在影响 / 建议行动」为 AI 分析，仅供参考。来源失效时请以标题与本地摘要为准。</div>
          </div>
        </div>
      )}
    </div>
  );
}

function Admin({ unit }: { unit: import("./types").Unit }) {
  const [name, setName] = useState(unit.name);
  useEffect(() => setName(unit.name), [unit.id, unit.name]);
  return (
    <div className="bm-admin">
      <div className="bm-head"><h2>企业名单维护 · {unit.name}</h2></div>
      <label className="bm-fld"><span>业务单元名称</span>
        <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => setUnitName(unit.id, name.trim() || unit.name)} />
      </label>
      <div className="bm-fld-h">对标企业（名称 / 别名以顿号或逗号分隔 / 是否启用）</div>
      {unit.companies.map((c) => (
        <div key={c.id} className="bm-corow">
          <input className="bm-coname" value={c.name} onChange={(e) => setCompany(unit.id, c.id, { name: e.target.value })} />
          <input className="bm-coalias" value={c.aliases.join("、")} placeholder="别名 / 简称 / 品牌 / 子公司…" onChange={(e) => setCompany(unit.id, c.id, { aliases: e.target.value.split(/[、,，]/).map((x) => x.trim()).filter(Boolean) })} />
          <label className="bm-coact"><input type="checkbox" checked={c.active} onChange={(e) => setCompany(unit.id, c.id, { active: e.target.checked })} /> 启用</label>
          <button type="button" className="bm-codel" onClick={() => removeCompany(unit.id, c.id)}>删</button>
        </div>
      ))}
      <button type="button" className="bm-coadd" onClick={() => addCompany(unit.id, "")}>+ 加对标企业</button>
    </div>
  );
}
