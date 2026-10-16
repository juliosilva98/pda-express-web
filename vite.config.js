import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O site é publicado em https://<usuario>.github.io/pda-express-web/
export default defineConfig({
  plugins: [react()],
  base: '/pda-express-web/',
});
