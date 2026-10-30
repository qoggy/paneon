import { useState, type ReactNode } from 'react';
import { CodeXml, Copy, WrapText } from 'lucide-react';
import { useBrowserAction } from './browser-action-context';
import { Button } from './button';
import {
  CodeBlockActions,
  CodeBlockHeader,
  CodeBlockRoot,
  CodeBlockTitle,
} from './code-block-primitives';
import { toast } from './toast-manager';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { useUI } from './use-ui';

const languageNames: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  json: 'JSON',
  jsonc: 'JSONC',
  sh: 'Bash',
  bash: 'Bash',
  yml: 'YAML',
  yaml: 'YAML',
  diff: 'Diff',
  python: 'Python',
  java: 'Java',
  css: 'CSS',
  html: 'HTML',
  markdown: 'Markdown',
  text: 'Plain Text',
  txt: 'Plain Text',
  plaintext: 'Plain Text',
};

/** Private shared chrome; callers retain ownership of content and annotation mapping. */
export function CodeBlockFrame({
  code,
  language,
  header = true,
  defaultWrap = true,
  className,
  'data-slot': slot = 'code-block',
  children,
}: {
  code: string;
  language?: string;
  header?: boolean | string;
  defaultWrap?: boolean;
  className?: string;
  'data-slot'?: string;
  children: (wrap: boolean) => ReactNode;
}) {
  const { t } = useUI();
  const browserAction = useBrowserAction();
  const [wrap, setWrap] = useState(defaultWrap);
  const [copying, setCopying] = useState(false);
  const languageKey = language?.toLowerCase() || 'text';
  const name = Object.hasOwn(languageNames, languageKey) ? languageNames[languageKey] : language;

  async function copy() {
    setCopying(true);
    try {
      await browserAction({ kind: 'copy-text', text: code });
      toast.add({ title: t('Code copied'), type: 'success' });
    } catch (error) {
      console.error('Copy code failed.', error);
      toast.add({ title: t('Unable to copy code.'), type: 'error' });
    } finally {
      setCopying(false);
    }
  }

  const actions = (
    <CodeBlockActions data-annotation-controls="" className="select-none">
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('Word wrap')}
              aria-pressed={wrap}
              onClick={() => setWrap((value) => !value)}
            >
              <WrapText />
            </Button>
          }
        />
        <TooltipContent>{t(wrap ? 'Disable word wrap' : 'Enable word wrap')}</TooltipContent>
      </Tooltip>
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={t('Copy code')}
              disabled={copying}
              focusableWhenDisabled
              onClick={() => void copy()}
            >
              <Copy />
            </Button>
          }
        />
        <TooltipContent>{t('Copy code')}</TooltipContent>
      </Tooltip>
    </CodeBlockActions>
  );

  return (
    <CodeBlockRoot className={className} data-slot={slot}>
      {header === false ? (
        actions
      ) : (
        <CodeBlockHeader data-annotation-controls="" className="select-none">
          <CodeBlockTitle>
            <CodeXml aria-hidden="true" />
            <span className="truncate">{typeof header === 'string' ? header : name}</span>
          </CodeBlockTitle>
          {actions}
        </CodeBlockHeader>
      )}
      {children(wrap)}
    </CodeBlockRoot>
  );
}
