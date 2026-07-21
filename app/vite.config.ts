import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Web 内核（第一段）。第二段封进 Tauri 时，前端 build 产物由 Tauri 壳加载。
export default defineConfig({
  // 相对路径：Tauri 壳与 file:// 预览都需要（避免绝对 /assets 加载失败）
  base: "./",
  plugins: [react()],
  build: { outDir: "dist" },
});
