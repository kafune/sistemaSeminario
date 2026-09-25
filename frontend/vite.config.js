import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Os WOFF2 só eram descobertos depois de baixar e interpretar o CSS, e o
// `font-display: swap` pintava a primeira tela na fonte de sistema. Os nomes
// saem com hash do build, então o preload é injetado a partir do bundle
// (AUDITORIA_VISUAL.md J1).
const FONTES_ACIMA_DA_DOBRA = [
  'bricolage-grotesque-latin-700-normal',
  'open-sans-latin-400-normal',
  'open-sans-latin-600-normal',
]

function preloadDeFontes() {
  return {
    name: 'tov-preload-de-fontes',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const arquivos = Object.keys(ctx.bundle || {}).filter(
          (nome) => nome.endsWith('.woff2')
            && FONTES_ACIMA_DA_DOBRA.some((peso) => nome.includes(peso)),
        )
        return arquivos.map((arquivo) => ({
          tag: 'link',
          injectTo: 'head-prepend',
          attrs: {
            rel: 'preload',
            as: 'font',
            type: 'font/woff2',
            href: `/${arquivo}`,
            crossorigin: '',
          },
        }))
      },
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    preloadDeFontes(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      injectManifest: {
        // Todos os chunks de interface entram no shell. Dados autenticados
        // continuam NetworkOnly no service worker, mas qualquer rota já pode
        // renderizar uma orientação útil mesmo no primeiro uso offline.
        globPatterns: [
          'index.html',
          'manifest.webmanifest',
          'assets/*.{js,css,woff2}',
          '**/*.{svg,png,ico}',
        ],
      },
      manifest: {
        name: 'TOV Acadêmico',
        short_name: 'TOV Acadêmico',
        description: 'Sistema acadêmico do Centro TOV de Formação Teológica.',
        lang: 'pt-BR',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: '#F5F2EE',
        theme_color: '#C92F2F',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          // Sangrado até a borda: o sistema aplica a própria máscara (círculo, gota...).
          { src: 'pwa-maskable-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
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
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/react-router') || id.includes('/node_modules/@remix-run/router')) return 'router'
          return undefined
        },
      },
    },
  },
})
