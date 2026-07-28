import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff,woff2}'],
      },
      manifest: {
        name: 'TOV Acadêmico',
        short_name: 'TOV Acadêmico',
        description: 'Sistema acadêmico do Centro TOV de Formação Teológica.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F7F4F1',
        theme_color: '#C92F2F',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
        shortcuts: [
          { name: 'Dashboard', url: '/', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'Calendário', url: '/calendario', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
          { name: 'WhatsApp', url: '/whatsapp', icons: [{ src: 'pwa-192x192.png', sizes: '192x192' }] },
        ],
      },
      devOptions: { enabled: true, type: 'module' },
    }),
  ],
  server: {
    port: 5173,
  },
})
