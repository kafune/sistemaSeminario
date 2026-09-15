import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// Pesos usados acima da dobra em toda tela: títulos em Bricolage 700 e o
// corpo em Open Sans 400/600. Os arquivos WOFF2 só eram descobertos depois
// de o CSS ser baixado e parseado, e `font-display: swap` pintava o texto na
// fonte de fallback nesse meio-tempo (FOUT). Os nomes com hash só existem no
// bundle, por isso o preload é injetado aqui e não escrito no index.html.
const FONTES_PRELOAD = [
  /bricolage-grotesque-latin-700-normal.*\.woff2$/,
  /open-sans-latin-400-normal.*\.woff2$/,
  /open-sans-latin-600-normal.*\.woff2$/,
]

function preloadDeFontes() {
  return {
    name: 'tov-preload-fontes',
    enforce: 'post',
    transformIndexHtml(html, contexto) {
      const bundle = contexto.bundle || {}
      const tags = Object.keys(bundle)
        .filter((nome) => FONTES_PRELOAD.some((padrao) => padrao.test(nome)))
        .map((nome) => ({
          tag: 'link',
          injectTo: 'head-prepend',
          attrs: { rel: 'preload', as: 'font', type: 'font/woff2', href: `/${nome}`, crossorigin: '' },
        }))
      return tags
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
