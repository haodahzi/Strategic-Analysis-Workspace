// 桌面外壳入口。
// - tauri-plugin-http：经 Rust 发 HTTP，绕过 WebView 的 CORS（真实模型 / 检索调用的关键）。
// - open_source_browser：内置浏览器，打开信息源站点（报告查一查 / 企查查 / 荣大二郎神 / 巨潮资讯等）。
//   登录在站点原生页完成（微信扫码 / 手机号+密码），登录态（cookie）持久化在本机 WebView 数据目录，
//   凭据不经过助手。研报可直接在窗口内下载（on_download 放行）回工作台上传；页内注入的工具条另提供
//   「抓取本页研报清单」（站内自动抓取）与「抓取此页正文」，分别经 grab_reports / grab_page 回传主窗口。
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

// 注入脚本（工具条 + 站内自动抓取）。单独成文件，便于维护；运行前由下方预置 window.__ZLGZT_SRC__。
const INJECT_JS: &str = include_str!("inject.js");

// 抓取回传（单页正文）：注入脚本调用，把正文以事件广播给主窗口（前端 listen('source-grab')）。
#[tauri::command]
fn grab_page(app: tauri::AppHandle, name: String, url: String, text: String) -> Result<(), String> {
    app.emit("source-grab", serde_json::json!({ "name": name, "url": url, "text": text }))
        .map_err(|e| e.to_string())
}

// 抓取回传（本页研报候选清单）：注入脚本采集原始候选，交主窗口（前端 scrape.ts 打分成清单）。
#[tauri::command]
fn grab_reports(app: tauri::AppHandle, source: String, page_url: String, items: serde_json::Value) -> Result<(), String> {
    app.emit("source-reports", serde_json::json!({ "source": source, "pageUrl": page_url, "items": items }))
        .map_err(|e| e.to_string())
}

// 打开信息源内置浏览器窗口。label=source-<id>，重复打开则聚焦已存在窗口。
#[tauri::command]
fn open_source_browser(app: tauri::AppHandle, url: String, label: String, title: String, name: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.set_focus();
        return Ok(());
    }
    let parsed: tauri::Url = url.parse().map_err(|e| format!("网址无效：{e}"))?;
    let script = format!("window.__ZLGZT_SRC__={:?};\n{}", name, INJECT_JS);
    WebviewWindowBuilder::new(&app, label, WebviewUrl::External(parsed))
        .title(title)
        .inner_size(1200.0, 840.0)
        .initialization_script(&script)
        .on_download(|_webview, _event| true) // 放行站内研报下载（WebView 默认保存到「下载」）
        .build()
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![open_source_browser, grab_page, grab_reports])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
