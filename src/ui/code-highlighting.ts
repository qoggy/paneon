import { Children, isValidElement, useEffect, useState, type ReactNode } from 'react';
import { createHighlighterCore } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import javascript from 'shiki/langs/javascript.mjs';
import typescript from 'shiki/langs/typescript.mjs';
import jsx from 'shiki/langs/jsx.mjs';
import tsx from 'shiki/langs/tsx.mjs';
import json from 'shiki/langs/json.mjs';
import jsonc from 'shiki/langs/jsonc.mjs';
import bash from 'shiki/langs/bash.mjs';
import yaml from 'shiki/langs/yaml.mjs';
import diff from 'shiki/langs/diff.mjs';
import python from 'shiki/langs/python.mjs';
import java from 'shiki/langs/java.mjs';
import css from 'shiki/langs/css.mjs';
import html from 'shiki/langs/html.mjs';
import markdown from 'shiki/langs/markdown.mjs';
import githubLight from 'shiki/themes/github-light.mjs';
import githubDark from 'shiki/themes/github-dark.mjs';
import type { CSSProperties } from 'react';
import type { ThemedTokenWithVariants } from 'shiki';

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
  'jsonc',
  'bash',
  'yaml',
  'diff',
  'python',
  'java',
  'css',
  'html',
  'markdown',
]);
// Every grammar and the theme are static imports: rendering never downloads code.
function getHighlighter() {
  return (highlighter ??= createHighlighterCore({
    themes: [githubLight, githubDark],
    langs: [
      javascript,
      typescript,
      jsx,
      tsx,
      json,
      jsonc,
      bash,
      yaml,
      diff,
      python,
      java,
      css,
      html,
      markdown,
    ],
    engine: createJavaScriptRegexEngine(),
  }));
}
let highlighter: ReturnType<typeof createHighlighterCore> | undefined;
type Tokens = ThemedTokenWithVariants[][];
function codeLanguage(language?: string) {
  const lang = aliases[language?.toLowerCase() ?? ''] ?? language?.toLowerCase() ?? 'text';
  return supported.has(lang) ? lang : 'text';
}

/** One shared tokenizer for Markdown, CodeBlock, file previews and diffs. */
export function useCodeHighlighting(code: string, language?: string) {
  const lang = codeLanguage(language);
  const highlight = lang !== 'text';
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
  return {
    language: lang,
    tokens: highlight && result?.code === code && result.lang === lang ? result.tokens : undefined,
  };
}

export function codeTokenStyle(token: ThemedTokenWithVariants): CSSProperties {
  return Object.fromEntries(
    Object.entries(token.variants).flatMap(([theme, style]) => [
      [`--shiki-${theme}-color`, style.color],
      [`--shiki-${theme}-style`, (style.fontStyle ?? 0) & 1 ? 'italic' : 'normal'],
      [`--shiki-${theme}-weight`, (style.fontStyle ?? 0) & 2 ? 'bold' : 'normal'],
    ]),
  );
}

export function markdownCodeText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) =>
      isValidElement<{ children?: ReactNode }>(child)
        ? markdownCodeText(child.props.children)
        : typeof child === 'string' || typeof child === 'number'
          ? String(child)
          : '',
    )
    .join('');
}
