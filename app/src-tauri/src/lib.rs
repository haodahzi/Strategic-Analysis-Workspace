// 桌面外壳入口。
// - tauri-plugin-http：经 Rust 发 HTTP，绕过 WebView 的 CORS（真实模型 / 检索调用的关键）。
// - open_source_browser：内置浏览器，打开信息源站点。窗口在「主线程」创建（关键：off-thread 建窗会卡死
//   —— 表现为空白页 / 关不掉 / 后续打不开），登录态持久化在本机，凭据不经过助手。
// - kv_get / kv_set：落盘持久化（app_data_dir/kv/*.json），容量不受 localStorage 5MB 限制，
//   在办分析与生成结果（材料/附件/报告正文）重启不丢。
mod intelligence;

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

// 回读刚下载的研报文件（供前端 pdfjs 抽取后自动入库）。仅允许读「下载 / 应用缓存 / 临时」目录内的文件，
// 杜绝第三方站点经内置浏览器越权读取任意本地文件。返回原始字节（前端得到 ArrayBuffer）。
#[tauri::command]
fn read_download(app: tauri::AppHandle, path: String) -> Result<tauri::ipc::Response, String> {
    let canon = std::fs::canonicalize(std::path::PathBuf::from(&path)).map_err(|e| e.to_string())?;
    let roots = [
        app.path().download_dir().ok(),
        app.path().app_cache_dir().ok(),
        std::env::temp_dir().canonicalize().ok(),
    ];
    let ok = roots
        .iter()
        .flatten()
        .any(|r| std::fs::canonicalize(r).map(|rc| canon.starts_with(rc)).unwrap_or(false));
    if !ok {
        return Err("只允许读取下载 / 缓存目录内的文件".into());
    }
    let bytes = std::fs::read(&canon).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
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
        let dl_app = app2.clone();
        let res = WebviewWindowBuilder::new(&app2, label, WebviewUrl::External(parsed))
            .title(title)
            .inner_size(1200.0, 840.0)
            .center()
            .initialization_script(&script)
            // 放行站内研报下载；下载完成后把落盘路径广播给主窗口，前端 pdfjs 抽取后自动入库。
            .on_download(move |_w, event| {
                if let tauri::webview::DownloadEvent::Finished { path, success, .. } = event {
                    if success {
                        if let Some(p) = path {
                            let name = p.file_name().and_then(|s| s.to_str()).map(String::from)
                                .unwrap_or_else(|| "下载文件".into());
                            let _ = dl_app.emit("source-download", serde_json::json!({
                                "path": p.to_string_lossy(), "name": name
                            }));
                        }
                    }
                }
                true
            })
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
        .setup(|app| {
            app.manage(intelligence::database::DatabaseState::default());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_source_browser,
            open_external,
            grab_page,
            grab_reports,
            read_download,
            kv_get,
            kv_set,
            intelligence::intelligence_health,
            intelligence::fetch_source_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
