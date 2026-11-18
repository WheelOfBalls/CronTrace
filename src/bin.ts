#!/usr/bin/env node
import { runCli } from './cli.ts';

process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  process.stderr.write(error.code === 'EPIPE' ? 'crontrace: output pipe closed before report delivery\n' : 'crontrace: unable to write output\n');
  process.exit(2);
});
process.exitCode = await runCli(process.argv.slice(2));
