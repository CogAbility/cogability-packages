import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    projects: [
      {
        extends: true,
        test: {
          name: 'sdk',
          include: ['packages/sdk/src/**/*.test.js'],
          environment: 'node',
        },
      },
      {
        extends: true,
        test: {
          name: 'membership-kit',
          include: ['packages/membership-kit/src/**/*.test.{js,jsx}'],
          environment: 'jsdom',
          globals: true,
          setupFiles: ['packages/membership-kit/src/test-setup.js'],
        },
      },
    ],
  },
});
