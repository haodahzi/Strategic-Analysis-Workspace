// 发布版禁止在 Windows 上弹出额外的控制台窗口，勿删。
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    app_lib::run()
}
