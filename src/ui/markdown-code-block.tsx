import {
  cloneElement,
  useState,
  type ComponentProps,
  type ReactElement,
  type ReactNode,
} from 'react';
import { CodeXml, Copy, WrapText } from 'lucide-react';
import { Button } from './button';
import { Tooltip, TooltipContent, TooltipTrigger } from './tooltip';
import { useBrowserAction } from './browser-action-context';
import { markdownCodeText } from './code-highlighting';
import { MarkdownCode } from './markdown-code';
import { toast } from './toast-manager';
import { useUI } from './use-ui';

const languageNames: Record<string, string> = {
  js: 'JavaScript',
  javascript: 'JavaScript',
  ts: 'TypeScript',
  typescript: 'TypeScript',
  jsx: 'JSX',
  tsx: 'TSX',
  json: 'JSON',
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

export function MarkdownCodeBlock({
  children,
  language,
  ...props
}: Omit<ComponentProps<'pre'>, 'children'> & {
  children: ReactElement<{ children?: ReactNode }>;
  language?: string;
}) {
  const { t } = useUI();
  const browserAction = useBrowserAction();
  const [wrap, setWrap] = useState(true);
  const [copying, setCopying] = useState(false);
  const wrapLabel = t(wrap ? 'Disable word wrap' : 'Enable word wrap');
  const languageKey = language?.toLowerCase() || 'text';
  const name = Object.hasOwn(languageNames, languageKey) ? languageNames[languageKey] : language;
  async function copy() {
    setCopying(true);
    try {
      await browserAction({ kind: 'copy-text', text: markdownCodeText(children.props.children) });
      toast.add({ title: t('Code copied'), type: 'success' });
    } catch (error) {
      console.error('Copy Markdown code failed.', error);
      toast.add({ title: t('Unable to copy code.'), type: 'error' });
    } finally {
      setCopying(false);
    }
  }
  return (
    <div data-slot="markdown-code-block" data-wrap={wrap}>
      <div
        data-annotation-controls=""
        className="flex items-center justify-between gap-3 px-5 pt-3 pb-2 font-sans text-sm select-none"
      >
        <div className="flex min-w-0 items-center gap-2 text-foreground">
          <CodeXml className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full hover:bg-foreground/5"
                  aria-label={t('Word wrap')}
                  aria-pressed={wrap}
                  onClick={() => setWrap((value) => !value)}
                >
                  <WrapText />
                </Button>
              }
            />
            <TooltipContent>{wrapLabel}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  className="rounded-full hover:bg-foreground/5"
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
        </div>
      </div>
      <pre {...props}>
        {cloneElement(
          children,
          undefined,
          <MarkdownCode language={language}>{children.props.children}</MarkdownCode>,
        )}
      </pre>
    </div>
  );
}
