import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

/**
 * Origin-agnostic build (build spec §21.1 part 3).
 * `FM_BASE` is the only thing that changes when the app moves hosts: the deployed
 * base path is `process.env.FM_BASE ?? '/'`. The default production value is
 * `/FieldMeasure/` (GitHub Pages); dev/preview use `/`.
 */
export default defineConfig({
  base: process.env.FM_BASE ?? '/',
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    VitePWA({
      // §19.2 / D25: prompt on update — never autoUpdate. A reload mid-measurement
      // is a data-risk; the update toast is slice 1.11.
      registerType: 'prompt',
      manifest: {
        name: 'Field Measure',
        short_name: 'FieldMeasure',
        display: 'standalone',
        // Exact strings fixed by slice 0.0 / build spec §21.1 (default host).
        start_url: '/FieldMeasure/',
        scope: '/FieldMeasure/',
        theme_color: '#1a1a1a',
        background_color: '#1a1a1a',
        icons: [
          {
            src: '/icons/icon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/icons/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // App shell + both self-hosted fonts (.woff2) + icons (.png/.svg).
        // A font not matched here is a silent no-op (§13/0.1 step 12).
        globPatterns: ['**/*.{js,css,html,woff2,png,svg}'],
        // NO runtimeCaching: user photos must never enter the SW cache (§2.2).
      },
    }),
  ],
});
