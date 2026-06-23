import { defineConfig } from 'vitest/config';
// Tests purs (cœur RF/géo), exécutés en environnement Node sans plugins Vite.
export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.{test,spec}.ts'],
    },
});
