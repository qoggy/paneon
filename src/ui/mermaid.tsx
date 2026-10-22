import { useUI } from './use-ui';
import { useEffect, useRef, useState } from 'react';
import { Spinner } from './spinner';
import { cn } from './utils';

let library: Promise<typeof import('mermaid').default> | undefined;

function getMermaid() {
  return (library ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
    return mermaid;
  }));
}

type RenderResult = { code: string; theme: string } & ({ svg: string } | { error: string });

export function Mermaid({ code, className }: { code: string; className?: string }) {
  const { t, theme } = useUI();
  const host = useRef<HTMLDivElement>(null);
  const [result, setResult] = useState<RenderResult>();

  useEffect(() => {
    let active = true;
    let container: HTMLDivElement | undefined;

    void (async () => {
      try {
        const mermaid = await getMermaid();
        if (!active) return;

        // Mermaid measures its SVG in the document; isolate its temporary/error nodes.
        container = document.createElement('div');
        container.style.position = 'absolute';
        container.style.visibility = 'hidden';
        container.style.pointerEvents = 'none';
        const width = host.current?.clientWidth;
        if (width) container.style.width = `${width}px`;
        document.body.append(container);

        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'dark' ? 'dark' : 'default',
        });
        const { svg } = await mermaid.render(`mermaid-${crypto.randomUUID()}`, code, container);
        if (active) setResult({ code, theme, svg });
      } catch (error) {
        if (active)
          setResult({ code, theme, error: error instanceof Error ? error.message : String(error) });
      } finally {
        container?.remove();
      }
    })();

    return () => {
      active = false;
      // The official renderer has no abort API and still measures connected nodes.
      // Keep the hidden container until its promise settles, then remove it above.
    };
  }, [code, theme]);

  const current = result?.code === code && result.theme === theme ? result : undefined;

  return (
    <div ref={host} data-slot="mermaid" className={cn('min-w-0 overflow-x-auto', className)}>
      {!current ? (
        <Spinner aria-label={t('Rendering diagram')} />
      ) : 'error' in current ? (
        <div role="alert" className="text-sm text-destructive">
          <p>{t('Unable to render diagram.')}</p>
          <pre className="whitespace-pre-wrap">{current.error}</pre>
        </div>
      ) : (
        <div dangerouslySetInnerHTML={{ __html: current.svg }} />
      )}
    </div>
  );
}
