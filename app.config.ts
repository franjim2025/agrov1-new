import { defineConfig } from '@tanstack/start/config'

export default defineConfig({
  server: {
    preset: 'vercel'
  },
  // Esto fuerza a la infraestructura a usar Vercel y no Cloudflare
  vinxi: {
    server: {
      preset: 'vercel'
    }
  }
})