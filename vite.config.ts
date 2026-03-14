import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      chunkSizeWarningLimit: 600,
      rollupOptions: {
        output: {
          manualChunks: {
            // React core
            'vendor-react': ['react', 'react-dom'],
            // Animation
            'vendor-motion': ['motion'],
            // Firebase (large)
            'vendor-firebase': ['firebase/app', 'firebase/auth'],
            // Socket.IO client
            'vendor-socket': ['socket.io-client'],
            // Icons
            'vendor-icons': ['lucide-react'],
          },
        },
      },
    },
  };
});
