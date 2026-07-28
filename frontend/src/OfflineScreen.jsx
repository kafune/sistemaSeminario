import { useEffect, useState } from 'react'
import { Box, Button, Typography } from '@mui/material'
import CloudOffIcon from '@mui/icons-material/CloudOff'
import { TOV } from './theme'

export default function OfflineScreen({ children }) {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const atualizar = () => setOnline(navigator.onLine)
    window.addEventListener('online', atualizar)
    window.addEventListener('offline', atualizar)
    return () => {
      window.removeEventListener('online', atualizar)
      window.removeEventListener('offline', atualizar)
    }
  }, [])
  if (online) return children
  return (
    <Box sx={{ minHeight: '100vh', bgcolor: TOV.offwhite, display: 'grid', placeItems: 'center', p: 3 }}>
      <Box sx={{ maxWidth: 440, textAlign: 'center' }}>
        <CloudOffIcon sx={{ fontSize: 54, color: TOV.coral, mb: 2 }} />
        <Typography variant="h2" sx={{ fontSize: 31 }}>Você está offline</Typography>
        <Typography sx={{ color: TOV.caption, mt: 1.5 }}>
          O TOV foi aberto, mas os dados acadêmicos são consultados somente online. Sua sessão e a rota atual serão preservadas quando a conexão voltar.
        </Typography>
        <Button variant="contained" sx={{ mt: 3 }} onClick={() => window.location.reload()}>Tentar novamente</Button>
      </Box>
    </Box>
  )
}
