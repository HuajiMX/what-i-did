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
    // 主包（公开页面）必须保持小体积，超限直接构建失败。
    // 见 scripts/check-bundle-size.mjs 里的说明。
    chunkSizeWarningLimit: 400,
  },
});
