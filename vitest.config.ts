import { defineConfig } from 'vitest/config';
import { allureReporter } from './tests/reporters/allureReporter';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    watch: false,
    reporters: ['default', allureReporter({ resultsDir: 'test-results' })],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov', 'html'],
      reportsDirectory: 'coverage',
      cleanOnRerun: true,
    },
    outputFile: {
      junit: 'test-results/junit.xml',
    },
    testTimeout: 30000,
    passWithNoTests: true,
  },
});
