import { defineConfig } from 'tsup';
import { readFileSync } from 'node:fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/resources.ts',
    'src/crypto-entry.ts',
    'src/trace-builders.ts',
    'src/advanced.ts',
    'src/types/index.ts',
    'src/adapters/langchain.ts',
    'src/adapters/crewai.ts',
    'src/adapters/autogen.ts',
    'src/cli/index.ts',
  ],
  format: ['cjs', 'esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  define: {
    __SDK_VERSION__: JSON.stringify(pkg.version),
  },
});
