// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import icon from 'astro-icon';

import alpinejs from '@astrojs/alpinejs';

import mermaid from 'astro-mermaid';

import varlockAstroIntegration from '@varlock/astro-integration';

import { ENV } from 'varlock/env';

// https://astro.build/config
export default defineConfig({
  site: ENV.SITE_URL,
  output: 'static',
  vite: {
    plugins: [tailwindcss()]
  },

  integrations: [
    varlockAstroIntegration(),
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
