import { defineConfig } from 'vite';

export default defineConfig({
  base: './', // 相对路径，适配 GitHub Pages 项目页
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
