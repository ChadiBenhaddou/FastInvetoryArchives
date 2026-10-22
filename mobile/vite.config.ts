import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import pkg from './package.json';

export default defineConfig({
    plugins: [react(), tailwindcss()],
    define: {
        __APP_VERSION__: JSON.stringify(pkg.version),
    },
    worker: {
        // Classic worker: it loads opencv.js (a static ~11 MB file inside the app) with importScripts().
        format: 'iife',
    },
    build: {
        outDir: 'dist',
    },
    test: {
        include: ['src/**/*.test.ts'],
    },
});
