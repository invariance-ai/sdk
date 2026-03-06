import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/cli/index.ts',
    'src/observability/adapters/langchain.ts',
    'src/observability/adapters/crewai.ts',
    'src/observability/adapters/autogen.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
  },
});
