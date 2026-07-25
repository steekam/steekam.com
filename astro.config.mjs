// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import icon from 'astro-icon';

import alpinejs from '@astrojs/alpinejs';
import { unified } from '@astrojs/markdown-remark';
import { remarkReadingTime } from './src/lib/remark-reading-time';

// https://astro.build/config
export default defineConfig({
  site: 'https://steekam.com',
  output: 'static',
  vite: {
    plugins: [tailwindcss()]
  },
  markdown: {
    processor: unified({ remarkPlugins: [remarkReadingTime] }),
  },

  integrations: [icon(), alpinejs({ entrypoint: '/src/alpinejs-entrypoint' })]
});
