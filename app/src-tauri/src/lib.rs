// 桌面外壳入口。
// - tauri-plugin-http：经 Rust 发 HTTP，绕过 WebView 的 CORS（真实模型 / 检索调用的关键）。
// - open_source_browser：内置浏览器，打开信息源站点。窗口在「主线程」创建（关键：off-thread 建窗会卡死
//   —— 表现为空白页 / 关不掉 / 后续打不开），登录态持久化在本机，凭据不经过助手。
// - kv_get / kv_set：落盘持久化（app_data_dir/kv/*.json），容量不受 localStorage 5MB 限制，
//   在办分析与生成结果（材料/附件/报告正文）重启不丢。
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

// 注入脚本（工具条 + 站内自动抓取）。单独成文件，运行前由下方预置 window.__ZLGZT_SRC__。
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

// 键名白名单：仅允许字母/数字/点/短横/下划线，杜绝路径穿越
fn safe_key(key: &str) -> Result<String, String> {
    if !key.is_empty() && key.len() <= 128 && key.chars().all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '-' | '_')) {
        Ok(key.to_string())
    } else {
        Err("非法存储键名".into())
    }
}

fn kv_dir(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    let d = app.path().app_data_dir().map_err(|e| e.to_string())?.join("kv");
    std::fs::create_dir_all(&d).map_err(|e| e.to_string())?;
    Ok(d)
}

// 落盘写入（原子：先写临时文件再改名，避免写一半导致下次读取损坏）
#[tauri::command]
fn kv_set(app: tauri::AppHandle, key: String, value: String) -> Result<(), String> {
    let k = safe_key(&key)?;
    let dir = kv_dir(&app)?;
    let tmp = dir.join(format!("{k}.json.tmp"));
    std::fs::write(&tmp, value.as_bytes()).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join(format!("{k}.json"))).map_err(|e| e.to_string())
}

// 落盘读取（不存在返回 null，不报错）
#[tauri::command]
fn kv_get(app: tauri::AppHandle, key: String) -> Result<Option<String>, String> {
    let k = safe_key(&key)?;
    let p = kv_dir(&app)?.join(format!("{k}.json"));
    match std::fs::read_to_string(&p) {
        Ok(s) => Ok(Some(s)),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

// 兜底：用系统默认浏览器打开（内置窗口异常时的可靠退路；登录/下载/上传流程一致）。
#[tauri::command]
fn open_external(url: String) -> Result<(), String> {
    let u = url.trim();
    if !(u.starts_with("http://") || u.starts_with("https://")) {
        return Err("仅支持 http/https 网址".into());
    }
    open::that(u).map_err(|e| e.to_string())
}

// 打开信息源内置浏览器窗口。label=source-<id>，重复打开则聚焦；建窗强制在主线程执行以免卡死。
#[tauri::command]
async fn open_source_browser(app: tauri::AppHandle, url: String, label: String, title: String, name: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.set_focus();
        return Ok(());
    }
    let parsed: tauri::Url = url.parse().map_err(|e| format!("网址无效：{e}"))?;
    let script = format!("window.__ZLGZT_SRC__={:?};\n{}", name, INJECT_JS);
    let app2 = app.clone();
    let (tx, rx) = std::sync::mpsc::channel();
    app.run_on_main_thread(move || {
        let res = WebviewWindowBuilder::new(&app2, label, WebviewUrl::External(parsed))
            .title(title)
            .inner_size(1200.0, 840.0)
            .center()
            .initialization_script(&script)
            .on_download(|_w, _e| true) // 放行站内研报下载（WebView 默认保存到「下载」）
            .build()
            .map(|_| ())
            .map_err(|e| e.to_string());
        let _ = tx.send(res);
    })
    .map_err(|e| e.to_string())?;
    rx.recv().map_err(|_| "窗口创建无响应".to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![open_source_browser, open_external, grab_page, grab_reports, kv_get, kv_set])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
