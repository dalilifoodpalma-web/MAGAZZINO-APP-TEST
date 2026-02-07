
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.API_KEY': JSON.stringify(process.env.API_KEY),
    'process.env.SUPABASE_URL': JSON.stringify(process.env.SUPABASE_URL),
    'process.env.SUPABASE_ANON_KEY': JSON.stringify(process.env.SUPABASE_ANON_KEY),
  },
  server: {
    historyApiFallback: true,
  },
  preview: {
    allowedHosts: [
      'magazzino-app-test.onrender.com',
      '.onrender.com'
    ]
  },
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom'],
          'vendor-db': ['@supabase/supabase-js'],
          'vendor-ai': ['@google/genai'],
          'vendor-utils': ['xlsx', 'lucide-react']
        }
      }
    }
  }
});
