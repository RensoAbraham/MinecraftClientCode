import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { PixelDust } from './components/PixelDust'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PixelDust />
    <App />
  </React.StrictMode>,
)
