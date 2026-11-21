import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: './',
  worker: { format: 'es' },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: { globIgnores:['**/*.wasm','vendor/ort/**'], runtimeCaching: [{urlPattern: /\/(?:vendor\/ort|assets)\/.*\.(wasm|mjs)$/,handler:'CacheFirst',options:{cacheName:'lines-local-runtime-v1',cacheableResponse:{statuses:[200]}}}] },
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'Line Buddy: Romeo and Juliet',
        short_name: 'Line Buddy',
        description: 'Learn your lines with short games.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any maskable' }],
      },
    }),
  ],
  test: { environment: 'node', include: ['tests/**/*.test.ts', 'tests/**/*.test.mjs'] },
});
