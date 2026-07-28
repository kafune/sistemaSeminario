import { useEffect, useRef, useState } from 'react'
import { Button, Snackbar } from '@mui/material'
import { registerSW } from 'virtual:pwa-register'

export default function PwaRuntime() {
  const [atualizacao, setAtualizacao] = useState(false)
  const atualizarSW = useRef(null)
  useEffect(() => {
    atualizarSW.current = registerSW({
      immediate: true,
      onNeedRefresh() { setAtualizacao(true) },
      onRegisteredSW(_url, registration) { registration?.update().catch(() => {}) },
    })
    const verificar = () => navigator.serviceWorker?.getRegistration().then((registro) => {
      if (registro?.waiting) setAtualizacao(true)
    }).catch(() => {})
    verificar()
    const timer = window.setInterval(verificar, 60_000)
    return () => window.clearInterval(timer)
  }, [])
  return (
    <Snackbar
      open={atualizacao}
      message="Nova versão disponível"
      action={<Button color="inherit" size="small" onClick={() => {
        setAtualizacao(false)
        atualizarSW.current?.(true)
      }}>Atualizar</Button>}
    />
  )
}
