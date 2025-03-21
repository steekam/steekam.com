// @ts-check
import { defineConfig } from 'astro/config';

import tailwindcss from '@tailwindcss/vite';

import icon from 'astro-icon';

import alpinejs from '@astrojs/alpinejs';
import { remarkReadingTime } from '@/lib/remark-reading-time';

// https://astro.build/config
export default defineConfig({
  vite: {
    plugins: [tailwindcss()]
  },
  markdown: {
    remarkPlugins: [remarkReadingTime]
  },

  integrations: [icon(), alpinejs({ entrypoint: '/src/alpinejs-entrypoint' })]
});
