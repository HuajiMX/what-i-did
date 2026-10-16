import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const API_TARGET = process.env.API_TARGET ?? "http://127.0.0.1:8787";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // 开发时前端在 5173、后端在 8787，用代理把 /api 转过去，
    // 这样 cookie 与相对路径在生产、开发两种形态下行为一致
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
    },
  },
  build: {
    outDir: "dist",
    // 与 scripts/check-bundle-size.mjs 的上限保持一致。
    // 全库图标是一个有意的懒加载 chunk（约 2.4 MB，仅管理员打开图标选择器时下载），
    // 因此把默认的 500 KB 警告阈值调高，避免留下无意义的噪音警告。
    // 真正的防线是那个脚本里的体积断言与入口包特征串检查。
    chunkSizeWarningLimit: 2700,
  },
});
