import React from 'react'
import ReactDOM from 'react-dom/client'
import { createBrowserRouter, RouterProvider } from 'react-router-dom'
import { CssBaseline, ThemeProvider } from '@mui/material'
import { tovTheme } from './theme'
import App from './App'
import './fonts.css'
import PwaRuntime from './PwaRuntime'

const router = createBrowserRouter([
  {
    path: '*',
    element: (
      <>
        <App />
        <PwaRuntime />
      </>
    ),
  },
])

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ThemeProvider theme={tovTheme}>
      <CssBaseline />
      <RouterProvider router={router} />
    </ThemeProvider>
  </React.StrictMode>,
)
