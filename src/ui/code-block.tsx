import { useEffect, useState } from 'react';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import javascript from 'shiki/langs/javascript.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import jsx from 'shiki/langs/jsx.mjs';
import tsx from 'shiki/langs/tsx.mjs';
import json from 'shiki/langs/json.mjs';
import bash from 'shiki/langs/bash.mjs';
import yaml from 'shiki/langs/yaml.mjs';
import diff from 'shiki/langs/diff.mjs';
import githubLight from 'shiki/themes/github-light.mjs';
import githubDark from 'shiki/themes/github-dark.mjs';
import type { CSSProperties } from 'react';
import type { ThemedTokenWithVariants } from 'shiki';
import { cn } from './utils';

const aliases: Record<string, string> = {
  js: 'javascript',
  ts: 'typescript',
  sh: 'bash',
  yml: 'yaml',
};
const supported = new Set([
  'javascript',
  'typescript',
  'jsx',
  'tsx',
  'json',
  'bash',
  'yaml',
  'diff',
]);
// Every grammar and the theme are static imports: rendering never downloads code.
function getHighlighter() {
  return (highlighter ??= createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [javascript, typescript, jsx, tsx, json, bash, yaml, diff],
    engine: createJavaScriptRegexEngine(),
  }));
}
let highlighter: ReturnType<typeof createHighlighterCore> | undefined;
type Tokens = ThemedTokenWithVariants[][];
export function CodeBlock({
  code,
  language,
  className,
}: {
  code: string;
  language?: string;
  className?: string;
}) {
  const lang = aliases[language?.toLowerCase() ?? ''] ?? language?.toLowerCase() ?? 'text';
  const highlight = supported.has(lang);
  const [result, setResult] = useState<{ code: string; lang: string; tokens: Tokens }>();
  useEffect(() => {
    let active = true;
    if (highlight)
      void getHighlighter().then((h) => {
        const tokens = h.codeToTokensWithThemes(code, {
          lang,
          themes: { light: 'github-light', dark: 'github-dark' },
        });
        if (active) setResult({ code, lang, tokens });
      });
    return () => {
      active = false;
    };
  }, [code, lang, highlight]);
  const tokens =
    highlight && result?.code === code && result.lang === lang ? result.tokens : undefined;
  return (
    <pre
      data-language={highlight ? lang : 'text'}
      className={cn(
        'max-w-full overflow-x-auto rounded-md border bg-muted/50 p-4 font-mono text-sm',
        className,
      )}
    >
      <code>
        {tokens
          ? tokens.map((line, i) => (
              <span key={i}>
                {line.map((token, j) => (
                  <span
                    key={j}
                    data-shiki-token=""
                    style={
                      Object.fromEntries(
                        Object.entries(token.variants).flatMap(([theme, style]) => [
                          [`--shiki-${theme}-color`, style.color],
                          [
                            `--shiki-${theme}-style`,
                            (style.fontStyle ?? 0) & 1 ? 'italic' : 'normal',
                          ],
                          [
                            `--shiki-${theme}-weight`,
                            (style.fontStyle ?? 0) & 2 ? 'bold' : 'normal',
                          ],
                        ]),
                      ) as CSSProperties
                    }
                  >
                    {token.content}
                  </span>
                ))}
                {i < tokens.length - 1 ? '\n' : ''}
              </span>
            ))
          : code}
      </code>
    </pre>
  );
}
