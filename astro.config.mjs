// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import icon from 'astro-icon';

import alpinejs from '@astrojs/alpinejs';

import mermaid from 'astro-mermaid';

// https://astro.build/config
export default defineConfig({
  site: 'https://steekam.me',
  output: 'static',
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [
    mermaid({
      autoTheme: true,
      mermaidConfig: {
        flowchart: {
          useMaxWidth: false
        }
      }
    }),
    icon(),
    alpinejs({ entrypoint: '/src/alpinejs-entrypoint' })
  ]
});
