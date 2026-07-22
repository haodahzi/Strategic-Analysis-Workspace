// 桌面外壳入口。第二段-a：先把既有 Web 内核装进原生 WebView 跑通打包链路；
// 原生能力（系统钥匙串存 Key / tauri-http 走真实模型绕过 CORS / SQLite 落库 /
// 文件另存导出物）在后续 chunk 逐个接入并各自过 CI 验证。
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
