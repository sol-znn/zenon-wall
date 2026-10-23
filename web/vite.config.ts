import {defineConfig, loadEnv, type Plugin} from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import {resolve} from 'path'

// Narrows the CSP's connect-src to the one origin this build reads from: Supabase.
function cspConnectSrc(urls: (string | undefined)[]): Plugin {
  const origins = urls.filter((u): u is string => !!u).map((u) => {
    try {
      return new URL(u).origin
    } catch {
      throw new Error(`not a URL: ${u}`)
    }
  })
  return {
    name: 'csp-connect-src',
    transformIndexHtml: (html) => html.replace('__SUPABASE_ORIGIN__', origins.join(' ')),
  }
}

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, process.cwd(), 'VITE_')
  return {
    // Relative, so one build works at a project site (/<repo>/), a custom domain
    // (/) and a local preview without a base-path flag to get wrong.
    base: './',
    plugins: [
      vue(),
      tailwindcss(),
      cspConnectSrc([process.env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_URL]),
    ],
    resolve: {alias: {'@': resolve(__dirname, './src')}},
    // No data: inlining: the CSP's font-src is 'self' only.
    build: {outDir: 'dist', emptyOutDir: true, assetsDir: 'static', assetsInlineLimit: 0},
    // nom-ui ships Vue/TS source, so this app compiles it rather than pre-bundling.
    optimizeDeps: {exclude: ['nom-ui']},
    server: {host: '127.0.0.1', port: 5174},
  }
})
