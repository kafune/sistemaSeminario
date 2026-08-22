import { Component } from 'react'
import { Box, Button, Typography } from '@mui/material'
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline'
import { TOV } from './theme'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { erro: null }
  }

  static getDerivedStateFromError(erro) {
    return { erro }
  }

  componentDidCatch(erro, informacoes) {
    console.error('Falha ao renderizar a interface', erro, informacoes)
  }

  render() {
    if (!this.state.erro) return this.props.children

    return (
      <Box component="main" sx={{ minHeight: '100vh', bgcolor: TOV.canvas, display: 'grid', placeItems: 'center', p: 2 }}>
        <Box role="alert" sx={{ width: '100%', maxWidth: 560, p: { xs: 3, sm: 4 }, bgcolor: TOV.surface, border: `1px solid ${TOV.border}`, borderRadius: TOV.radiusMd }}>
          <ErrorOutlineIcon sx={{ color: TOV.danger, fontSize: TOV.type.displaySm, mb: 2 }} />
          <Typography component="h1" variant="h2" sx={{ fontSize: TOV.type.titleLg }}>A página encontrou um problema</Typography>
          <Typography sx={{ mt: 1.5, color: TOV.caption }}>
            Seus dados já salvos continuam seguros. Recarregue a página para tentar recuperar esta tela.
          </Typography>
          <Button variant="contained" onClick={() => window.location.reload()} sx={{ mt: 3 }}>
            Recarregar página
          </Button>
        </Box>
      </Box>
    )
  }
}
