#!/usr/bin/env node

import { runCli } from './app.js';

async function main() {
  const exitCode = await runCli(process.argv.slice(2));
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
