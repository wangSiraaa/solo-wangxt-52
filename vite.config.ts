/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: { host: true },
  test: {
    setupFiles: ['./src/test/setup.ts'],
    environment: 'node',
  },
});
