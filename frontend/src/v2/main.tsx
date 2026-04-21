// frontend/src/v2/main.tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@v2/App'
import '@v2/styles/index.css'

const rootEl = document.getElementById('root')
if (!rootEl) {
  throw new Error('#root not found')
}

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
