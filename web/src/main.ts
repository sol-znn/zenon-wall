import {createApp} from 'vue'
import {useTheme} from 'nom-ui'
import App from './App.vue'
import {router} from './router'
import './style.css'

// Dark by default — the design system's native habitat, and the original wall's
// look. The header toggle pins an explicit choice that wins on later visits.
const {initTheme, setTheme} = useTheme()
let stored: string | null = null
try {
  stored = localStorage.getItem('nom-wallet-theme')
} catch {
  // Storage blocked: fall through to the default.
}
if (stored === null) setTheme('dark')
else void initTheme()

createApp(App).use(router).mount('#app')
