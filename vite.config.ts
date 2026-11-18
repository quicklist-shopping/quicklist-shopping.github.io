import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Set VITE_BASE_PATH to '/<repository>/' for a GitHub Pages project site.
export default defineConfig({
  plugins: [react()],
  base: process.env.VITE_BASE_PATH || '/',
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          minSize: 20_000,
          maxSize: 450_000,
          groups: [
            { name: 'firebase', test: /node_modules\/(?:@firebase|firebase)\//, priority: 10 },
            { name: 'mui', test: /node_modules\/(?:@mui|@emotion)\//, priority: 5 },
          ],
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
