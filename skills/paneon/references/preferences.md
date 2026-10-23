# Interface preferences

Paneon provides one user-level setting for theme (`light` / `dark`) and one for
language (`en` / `zh-CN`). Defaults are `light` and `en`. Use **Settings** on the
home page or the same CLI configuration:

```sh
paneon config get --json
paneon config set ui.theme dark --json
paneon config set ui.language zh-CN --json
```

These commands start the local runtime when needed. Effective values are returned
as `{ "ui": { "theme": "dark", "language": "zh-CN" } }` inside the ordinary result
envelope. Configuration is merged into `~/.paneon/config.json`, preserving other
keys. Settings save immediately; a failed save displays an error and retains the
previous preference. CLI diagnostics and machine fields remain English.

Open home pages, hosts, and panels compiled with this version share updates
without refreshing, remounting the panel, repeating business queries, or emitting
interaction events. This preserves answers, current question and summary,
annotation edits, saved annotations, Git selections, and event receipts. Preferences
are UI environment data, never panel params, event fields, or content hashes.

## Authoring

Public components inherit the root theme automatically. Use theme variables and
utilities such as `bg-background`, `text-foreground`, and `border-border`. Markdown,
CodeBlock, Mermaid, Diff, and Portal controls follow the explicit setting even
when the operating system uses a different theme.

```tsx
import { useUI } from 'paneon/ui';

function MyPage() {
  const { theme, language } = useUI();
  return (
    <p className="text-foreground">
      {language === 'zh-CN' ? '你的自定义内容' : 'Your custom content'} · {theme}
    </p>
  );
}
```

Paneon translates only its own default controls and standard-page instructions,
including accessible labels, placeholders, validation summaries and receipts.
Caller-provided children, labels, titles, questions, options, Markdown, code,
annotations and external error details stay exactly as supplied. Author-controlled
fixed colors and prose remain the author's responsibility. Standard-page locale
resources live alongside the complete skill under `assets/shared/`; retain them
when copying a page.

Existing instances compiled by an older release and previously copied custom
TSX do not acquire new hardcoded translations automatically. Update/recompile
when appropriate; Paneon does not force a reload that could discard a draft.
Manual edits of the config file are read at the next runtime startup. Live
updates use the supported Settings or CLI entry points.
