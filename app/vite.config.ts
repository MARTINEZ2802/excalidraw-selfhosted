import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Excalidraw usa process.env.IS_PREACT en tiempo de build
  define: { "process.env.IS_PREACT": JSON.stringify("false") },
  build: { chunkSizeWarningLimit: 4000 },
});
