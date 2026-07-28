import { useEffect, useState } from 'react'
import { Alert, Snackbar } from '@mui/material'
import CloudOffIcon from '@mui/icons-material/CloudOff'

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
  return (
    <>
      {children}
      <Snackbar
        open={!online}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
        sx={{
          bottom: { xs: 'calc(78px + env(safe-area-inset-bottom))', sm: 24 },
          maxWidth: { xs: 'calc(100% - 24px)', sm: 520 },
        }}
      >
        <Alert
          severity="warning"
          icon={<CloudOffIcon />}
          variant="filled"
          role="status"
          sx={{ width: '100%', alignItems: 'center' }}
        >
          Sem conexão. Seu trabalho continua nesta tela e será possível salvar quando a internet voltar.
        </Alert>
      </Snackbar>
    </>
  )
}
