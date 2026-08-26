import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "ToonAI Studio",
        short_name: "ToonAI",
        theme_color: "#7c3aed",
        display: "standalone",
        icons: [],
      },
    }),
  ],
});
