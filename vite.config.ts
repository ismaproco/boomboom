import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const apiPort = process.env.API_PORT ?? '3210'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [{ name: 'recharts', test: /node_modules[\\/]recharts/ }],
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': `http://localhost:${apiPort}`,
    },
  },
})
