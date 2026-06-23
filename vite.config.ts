import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [react(), tailwindcss()],

  // AlphaTab cria seu próprio web worker via `new URL("./alphaTab.worker.mjs", import.meta.url)`.
  // O pré-bundler do Vite tenta reescrever isso para .vite/deps e quebra ("file does not exist").
  // Excluir da otimização faz o import.meta.url resolver para o arquivo real em node_modules.
  optimizeDeps: {
    exclude: ["@coderline/alphatab"],
  },

  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? { protocol: "ws", host, port: 1421 }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
  },
});
