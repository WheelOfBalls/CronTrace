#!/usr/bin/env node
import { runCli } from './cli.ts';

process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(0);
  process.stderr.write('crontrace: unable to write output\n');
  process.exit(2);
});
process.exitCode = await runCli(process.argv.slice(2));
