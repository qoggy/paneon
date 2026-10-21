import { compilePanel } from './index.js';
import { diagnostic } from '../shared/types.js';

// A disconnected control process must not leave a compiler or its metadata
// execution process running. inspectServer registers metadata cleanup on exit.
process.once('disconnect', () => process.exit(0));
process.once('SIGTERM', () => process.exit(0));
process.once('message', (raw: unknown) => {
  const { entryPath, panelRoot } = raw as { entryPath: string; panelRoot: string };
  void compilePanel(entryPath, panelRoot).then(
    (data) => process.send?.({ ok: true, data }, () => process.exit(0)),
    (error: unknown) =>
      process.send?.({ ok: false, error: diagnostic(error) }, () => process.exit(1)),
  );
});
