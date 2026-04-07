import { defineConfig } from 'allure';

export default defineConfig({
  name: 'TaskStream Allure Suite',
  output: './tmp/allure-report',
  plugins: {
    awesome: {
      options: {
        reportLanguage: 'en',
      },
    },
  },
});
