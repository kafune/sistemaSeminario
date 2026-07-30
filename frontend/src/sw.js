/* Service worker customizado: o plugin injeta somente os arquivos do shell. */
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching'
import { ExpirationPlugin } from 'workbox-expiration'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkOnly } from 'workbox-strategies'

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// O runtime do Vite PWA envia esta mensagem quando o usuário confirma a
// atualização. Mantemos a troca de versão explícita, sem recarregar formulários
// automaticamente enquanto houver uma versão nova aguardando.
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting()
})
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})

// Navegações offline recebem o shell da aplicação. A tela React preserva a
// rota e explica que os dados acadêmicos exigem conexão.
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html'), {
  denylist: [/^\/api\//],
}))

// Nunca cacheia dados acadêmicos, nem tenta enfileirar alterações offline.
registerRoute(
  ({ url }) => url.pathname.startsWith('/api/'),
  new NetworkOnly(),
)

// Chunks com hash são imutáveis. Guardá-los depois da primeira visita mantém
// as rotas já usadas disponíveis offline sem baixar todas as telas no install.
registerRoute(
  ({ request, url }) => (
    url.origin === self.location.origin
    && url.pathname.startsWith('/assets/')
    && ['script', 'style', 'font'].includes(request.destination)
  ),
  new CacheFirst({
    cacheName: 'tov-assets-v1',
    plugins: [
      new ExpirationPlugin({ maxEntries: 80, maxAgeSeconds: 30 * 24 * 60 * 60 }),
    ],
  }),
)
self.addEventListener('push', (event) => {
  let dados = {}
  try { dados = event.data?.json() || {} } catch { dados = {} }
  const titulo = dados.titulo || 'TOV Acadêmico'
  event.waitUntil(self.registration.showNotification(titulo, {
    body: dados.corpo || 'Há uma atualização na central de notificações.',
    icon: '/pwa-192x192.png',
    badge: '/notification-icon.png',
    tag: `tov-notificacao-${dados.notificacao_id || Date.now()}`,
    data: { rota: dados.rota || '/', notificacaoId: dados.notificacao_id || null },
  }))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = new URL(event.notification.data?.rota || '/', self.location.origin).href
  event.waitUntil((async () => {
    const janelas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const existente = janelas[0]
    if (existente) {
      await existente.navigate(destino)
      return existente.focus()
    }
    return self.clients.openWindow(destino)
  })())
})

self.addEventListener('push', (event) => {
  const dados = (() => { try { return event.data?.json() || {} } catch { return {} } })()
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(
    (janelas) => Promise.all(janelas.map((janela) => janela.postMessage({ type: 'TOV_PUSH', dados }))),
  ))
})
