import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import PetOverlay from './PetOverlay'
import './styles.css'
import './pet.css'

const mode = new URLSearchParams(window.location.search).get('mode')

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {mode === 'pet' ? <PetOverlay /> : <App />}
  </StrictMode>,
)
