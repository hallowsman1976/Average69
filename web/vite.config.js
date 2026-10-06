import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' ให้ path ของ asset เป็นแบบสัมพัทธ์ ใช้ได้ทั้ง GitHub Pages (/Average69/) และโดเมนอื่น
export default defineConfig({
  base: './',
  plugins: [react()],
});
