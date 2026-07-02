import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CssBaseline, ThemeProvider, createTheme } from '@mui/material'
import { ptBR } from '@mui/material/locale'
import App from './App'

const theme = createTheme(
  {
    palette: {
      primary: { main: '#5a7302' }, // verde institucional do boletim
      secondary: { main: '#37474f' },
    },
  },
  ptBR,
)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
)
