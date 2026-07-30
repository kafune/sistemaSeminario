import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { tovTheme } from './theme'
import App from './App'
import './fonts.css'
import PwaRuntime from './PwaRuntime'

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={tovTheme}>
      <CssBaseline />
      <BrowserRouter>
        <App />
        <PwaRuntime />
      </BrowserRouter>
    </ThemeProvider>
  </React.StrictMode>,
)
