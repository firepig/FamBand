import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import 'bootstrap/dist/css/bootstrap.min.css'
import './themes/retro.css'
import './App.css'
import App from './App.jsx'

// Set default theme — swappable later via [data-theme] on <html>
document.documentElement.setAttribute('data-theme', 'retro')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
