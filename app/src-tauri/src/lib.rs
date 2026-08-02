// 桌面外壳入口。
// - tauri-plugin-http：经 Rust 发 HTTP，绕过 WebView 的 CORS（真实模型 / 检索调用的关键）。
// - open_source_browser：内置浏览器，打开信息源站点（报告查一查 / 企查查 / 荣大二郎神 / 巨潮资讯等）。
//   登录在站点原生页完成（微信扫码 / 手机号+密码），登录态（cookie）持久化在本机 WebView 数据目录，
//   凭据不经过助手。研报可直接在窗口内下载（on_download 放行），回工作台上传；
//   页内注入的工具条另提供「抓取此页正文」试验路径，经 grab_page 命令回传主窗口。
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

// 注入到信息源窗口的工具条：顶部一条，提供「抓取此页正文加入本单」与使用提示。
// 仅顶层文档注入一次；抓取时剥离脚本/样式/导航，取正文 innerText 回传。
const INJECT_JS: &str = r#"
(function () {
  try {
    if (window.top !== window) return;
    if (document.getElementById('zlgzt-bar')) return;
    var SRC = (window.__ZLGZT_SRC__ || '信息源');
    function invoke(cmd, args) {
      var i = (window.__TAURI_INTERNALS__ && window.__TAURI_INTERNALS__.invoke)
           || (window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke);
      if (!i) return Promise.reject(new Error('no-ipc'));
      return i(cmd, args);
    }
    function pageText() {
      var root = document.querySelector('article, main, #content, .content') || document.body;
      var c = root.cloneNode(true);
      c.querySelectorAll('script,style,noscript,svg,nav,header,footer,iframe').forEach(function (n) { n.remove(); });
      var t = (c.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
      return t.slice(0, 200000);
    }
    function mkBtn(label, bg, fn) {
      var b = document.createElement('button');
      b.textContent = label;
      b.style.cssText = 'margin-left:8px;padding:4px 12px;border:0;border-radius:6px;cursor:pointer;font-size:13px;color:#fff;background:' + bg;
      b.onclick = fn; return b;
    }
    function build() {
      if (document.getElementById('zlgzt-bar')) return;
      var bar = document.createElement('div');
      bar.id = 'zlgzt-bar';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:2147483647;display:flex;align-items:center;'
        + 'padding:6px 14px;background:#8a1f18;color:#fff;font-size:13px;box-shadow:0 1px 6px rgba(0,0,0,.3);'
        + 'font-family:-apple-system,Segoe UI,Microsoft YaHei,sans-serif';
      var lb = document.createElement('span');
      lb.textContent = '战略工作台 · 从「' + SRC + '」获取资料：登录后下载研报回工作台上传（最佳），或抓取本页正文';
      lb.style.cssText = 'flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
      bar.appendChild(lb);
      var msg = mkBtn('抓取此页正文加入本单', '#c0392b', function () {
        var text = pageText();
        if (!text) { msg.textContent = '本页无正文'; return; }
        var name = SRC + ' · ' + ((document.title || '网页').slice(0, 40)) + '（抓取）';
        msg.textContent = '回传中…';
        invoke('grab_page', { name: name, url: location.href, text: text })
          .then(function () { msg.textContent = '已加入本单 ✓'; setTimeout(function () { msg.textContent = '抓取此页正文加入本单'; }, 2000); })
          .catch(function () { msg.textContent = '此页抓取未生效，请改用「下载研报→上传」'; });
      });
      bar.appendChild(msg);
      bar.appendChild(mkBtn('隐藏', '#5a5a5a', function () { bar.remove(); document.documentElement.style.paddingTop = ''; }));
      document.documentElement.style.paddingTop = '38px';
      (document.body || document.documentElement).appendChild(bar);
    }
    if (document.body) build();
    else document.addEventListener('DOMContentLoaded', build);
  } catch (e) { /* 注入失败不影响站点浏览 */ }
})();
"#;

// 抓取回传：注入脚本调用，把正文以事件广播给主窗口（前端 listen('source-grab')）。
#[tauri::command]
fn grab_page(app: tauri::AppHandle, name: String, url: String, text: String) -> Result<(), String> {
    app.emit("source-grab", serde_json::json!({ "name": name, "url": url, "text": text }))
        .map_err(|e| e.to_string())
}

// 打开信息源内置浏览器窗口。label=source-<id>，重复打开则聚焦已存在窗口。
#[tauri::command]
fn open_source_browser(app: tauri::AppHandle, url: String, label: String, title: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window(&label) {
        let _ = w.set_focus();
        return Ok(());
    }
    let parsed: tauri::Url = url.parse().map_err(|e| format!("网址无效：{e}"))?;
    let script = format!("window.__ZLGZT_SRC__={:?};\n{}", title, INJECT_JS);
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
        .invoke_handler(tauri::generate_handler![open_source_browser, grab_page])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
