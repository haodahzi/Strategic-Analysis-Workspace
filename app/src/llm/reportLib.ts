// 报告库（#7）：一键排版的成品定稿存本机 localStorage，可在「报告库」回看 / 导出。
// 按 analysisId + focus 去重更新（同一单重排版覆盖旧的）。
export interface SavedReport {
  id: string;
  analysisId: string;
  title: string;
  subject: string;
  focus: string;
  markdown: string;
  savedAt: string;   // ISO
}

const KEY = "dw.reports.v1";

function read(): SavedReport[] {
  try { const v = JSON.parse(localStorage.getItem(KEY) ?? "[]"); return Array.isArray(v) ? v : []; }
  catch { return []; }
}
function write(rs: SavedReport[]) { localStorage.setItem(KEY, JSON.stringify(rs)); }

export function listReports(): SavedReport[] {
  return read().sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function saveReport(r: { analysisId: string; title: string; subject: string; focus: string; markdown: string }): SavedReport {
  const rs = read();
  const idx = rs.findIndex((x) => x.analysisId === r.analysisId && x.focus === r.focus);
  const rec: SavedReport = {
    id: idx >= 0 ? rs[idx].id : "r-" + Date.now().toString(36),
    savedAt: new Date().toISOString(),
    ...r,
  };
  if (idx >= 0) rs[idx] = rec; else rs.unshift(rec);
  write(rs);
  return rec;
}

export function getReport(id: string): SavedReport | undefined { return read().find((x) => x.id === id); }
export function removeReport(id: string) { write(read().filter((x) => x.id !== id)); }
