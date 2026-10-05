import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "todocal",
        short_name: "todocal",
        description: "Todoist 캘린더",
        lang: "ko",
        theme_color: "#ff6b4a",
        background_color: "#ffffff",
        display: "standalone",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
      },
      workbox: {
        // API 응답은 항상 최신이어야 하므로 캐시하지 않는다
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 5181,
    proxy: { "/api": "http://127.0.0.1:5180" },
  },
});
