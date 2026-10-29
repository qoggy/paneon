import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { serverAction, z } from '@qoggy/paneon/sdk';
import { PanelInputContext } from '@qoggy/paneon/sdk/client';
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
} from 'react';
import { Copy, Download, Link } from 'lucide-react';
import { markdownLink } from '../shared/file-references';
import { useBrowserAction } from './browser-action-context';
import { DropdownMenuItem, DropdownMenuSeparator } from './dropdown-menu';
import { useImagePreview } from './image-preview';
import { MediaToolbar } from './media-toolbar';
import { Spinner } from './spinner';
import { useToastManager } from './toast-manager';
import { cn } from './utils';
import { useUI } from './use-ui';

const imageMime: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.avif': 'image/avif',
};
const imageLimit = 20 * 1024 * 1024;
const resourceErrors: Record<string, { code: string; message: string }> = {
  ENOENT: { code: 'FILE_NOT_FOUND', message: 'The referenced file does not exist.' },
  ENOTDIR: { code: 'FILE_NOT_FOUND', message: 'The referenced file does not exist.' },
  EACCES: { code: 'FILE_ACCESS_DENIED', message: 'The referenced file could not be read.' },
  EPERM: { code: 'FILE_ACCESS_DENIED', message: 'The referenced file could not be read.' },
};

async function readImageFile(path: string, signal: AbortSignal) {
  const mime = imageMime[extname(path).toLowerCase()];
  if (!mime)
    throw Object.assign(new Error('Unsupported image format.'), {
      code: 'IMAGE_FORMAT_UNSUPPORTED',
    });
  const file = await open(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile())
      throw Object.assign(new Error('The reference does not point to a regular file.'), {
        code: 'FILE_NOT_REGULAR',
      });
    if (stat.size > imageLimit)
      throw Object.assign(new Error('Image preview is limited to 20 MiB.'), {
        code: 'IMAGE_TOO_LARGE',
      });
    const bytes = Buffer.alloc(Math.min(stat.size + 1, imageLimit + 1));
    let length = 0;
    while (length < bytes.length) {
      signal.throwIfAborted();
      const result = await file.read(bytes, length, bytes.length - length, null);
      if (!result.bytesRead) break;
      length += result.bytesRead;
    }
    if (length > stat.size)
      throw Object.assign(new Error('The image changed while being read. Open it again.'), {
        code: 'IMAGE_CHANGED',
      });
    return `data:${mime};base64,${bytes.subarray(0, length).toString('base64')}`;
  } finally {
    await file.close();
  }
}

/** Private component action; the public UI barrel exports only Image and its props. */
// eslint-disable-next-line react-refresh/only-export-components -- The library build extracts component actions.
export const readImage = serverAction({
  kind: 'query',
  input: z.object({ href: z.string(), sourcePath: z.string().optional() }).strict(),
  handler: async (ctx, input) => {
    try {
      const target = markdownLink(input.href);
      if (target.kind === 'web') {
        const response = await fetch(target.url, { signal: ctx.signal });
        if (!response.ok)
          throw Object.assign(new Error(`Unable to read image: HTTP ${response.status}.`), {
            code: 'IMAGE_REQUEST_FAILED',
          });
        const mime =
          response.headers.get('content-type')?.split(';')[0] ?? 'application/octet-stream';
        const bytes = Buffer.from(await response.arrayBuffer());
        return {
          ok: true as const,
          path: target.url,
          content: `data:${mime};base64,${bytes.toString('base64')}`,
        };
      }
      if (target.kind !== 'file')
        throw Object.assign(new Error('A local image path is required.'), {
          code: 'INVALID_FILE_REFERENCE',
        });
      const cwd = process.cwd();
      const path = resolve(
        input.sourcePath ? dirname(resolve(cwd, input.sourcePath)) : cwd,
        target.path,
      );
      return { ok: true as const, path, content: await readImageFile(path, ctx.signal) };
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      const mapped = code ? resourceErrors[code] : undefined;
      if (mapped) return { ok: false as const, error: mapped };
      if (error instanceof Error && code && /^(FILE_|IMAGE_|INVALID_FILE_REFERENCE$)/.test(code))
        return { ok: false as const, error: { code, message: error.message } };
      throw error;
    }
  },
});

export type ImageProps = {
  src: string;
  alt: string;
  sourcePath?: string;
  className?: string;
};

export function Image(props: ImageProps) {
  return <ImageContent {...props} />;
}

/** Internal adapter also retains native attributes supplied by Markdown renderers. */
export function ImageContent({
  sourcePath,
  className,
  alt,
  ...props
}: ComponentProps<'img'> & { sourcePath?: string }) {
  const { t, message } = useUI();
  const inPanel = useContext(PanelInputContext) !== undefined;
  const source = typeof props.src === 'string' ? props.src : '';
  const local = inPanel && !!readImage.actionId && markdownLink(source).kind === 'file';
  const key = JSON.stringify([source, sourcePath]);
  const [resource, setResource] = useState<{ key: string; src?: string; error?: string }>();
  const [status, setStatus] = useState<{
    key: string;
    src: ComponentProps<'img'>['src'];
    error: boolean;
    previewable: boolean;
  }>();
  const imageRef = useRef<HTMLImageElement>(null);
  const browserAction = useBrowserAction();
  const toast = useToastManager();
  const [busy, setBusy] = useState(false);
  // A viewer retains its selected image callback; its action lock must stay live.
  const running = useRef(false);
  const preview = useImagePreview({
    download: (url) => void run('download-image', url),
    downloadLabel: t('Download original'),
    busy,
  });
  useEffect(() => {
    if (!local) return;
    let active = true;
    void readImage({
      href: source,
      ...(sourcePath ? { sourcePath } : {}),
    }).then(
      (result) => {
        if (active)
          setResource(
            result.ok ? { key, src: result.content } : { key, error: result.error.message },
          );
      },
      (error) => {
        console.error('Local image read failed.', error);
        if (active) setResource({ key, error: 'Unable to load image.' });
      },
    );
    return () => {
      active = false;
    };
  }, [source, sourcePath, key, local]);
  const current = resource?.key === key ? resource : undefined;
  const actualSrc = local ? current?.src : props.src;
  const currentStatus = status?.key === key && status.src === actualSrc ? status : undefined;
  const failure =
    (local ? current?.error : undefined) ??
    (currentStatus?.error ? 'Unable to load image.' : undefined);
  const ready = !!currentStatus && !currentStatus.error;
  const loading = !!props.src && !failure && !ready;
  const expandable = ready && currentStatus.previewable;
  useLayoutEffect(() => {
    // Cached images may finish before React attaches their load listener.
    const element = imageRef.current;
    if (element?.complete && element.naturalWidth)
      setStatus({ key, src: actualSrc, error: false, previewable: !element.closest('a') });
  }, [key, actualSrc]);
  async function run(kind: 'copy-text' | 'copy-image' | 'download-image', selectedUrl?: string) {
    if (running.current) return;
    running.current = true;
    setBusy(true);
    try {
      if (kind === 'copy-text') await browserAction({ kind, text: source });
      else {
        const image = imageRef.current;
        let url = selectedUrl ?? (image?.currentSrc || image?.src);
        if (!url) throw new Error('The image is unavailable.');
        const target = markdownLink(source);
        const path = target.kind === 'file' ? target.path : new URL(url).pathname;
        const filename = source.startsWith('data:') ? 'image' : path.split('/').at(-1) || 'image';
        if (inPanel && target.kind === 'web') {
          const result = await readImage({ href: source });
          if (!result.ok)
            throw Object.assign(new Error(result.error.message), { code: result.error.code });
          url = result.content;
        }
        await browserAction({ kind, url, filename });
      }
      toast.add({
        title: t(
          kind === 'copy-text'
            ? 'Path copied'
            : kind === 'copy-image'
              ? 'Image copied'
              : 'Image downloaded',
        ),
        type: 'success',
      });
    } catch (error) {
      console.error('Image browser action failed.', error);
      toast.add({ title: t('Unable to complete image action.'), type: 'error' });
    } finally {
      running.current = false;
      setBusy(false);
    }
  }
  return (
    <>
      {failure ? (
        <span role="status" className="text-destructive">
          {alt ? `${alt}: ` : ''}
          {message(failure)}
        </span>
      ) : (
        <span
          data-slot="image"
          className="group/media inline-flex max-w-full items-start gap-2 align-top"
        >
          {loading && (
            <span
              role="status"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground"
            >
              <Spinner aria-hidden="true" />
              {t('Loading image…')}
            </span>
          )}
          {(actualSrc !== undefined || !local) && (
            <img
              {...props}
              key={key}
              ref={imageRef}
              src={actualSrc}
              alt={alt}
              hidden={loading ? true : props.hidden}
              role={expandable ? 'button' : undefined}
              tabIndex={expandable ? 0 : undefined}
              aria-label={expandable ? `${t('Expand image')}${alt ? `: ${alt}` : ''}` : undefined}
              className={cn(
                'min-w-0',
                expandable &&
                  'cursor-zoom-in outline-offset-2 focus-visible:outline-2 focus-visible:outline-ring',
                className,
              )}
              onLoad={(event) => {
                setStatus({
                  key,
                  src: actualSrc,
                  error: false,
                  previewable: !event.currentTarget.closest('a'),
                });
                props.onLoad?.(event);
              }}
              onError={(event) => {
                setStatus({ key, src: actualSrc, error: true, previewable: false });
                props.onError?.(event);
              }}
              onPointerDownCapture={(event) => {
                preview.events.onPointerDownCapture?.(event);
                props.onPointerDownCapture?.(event);
              }}
              onClick={(event) => {
                props.onClick?.(event);
                if (!event.isPropagationStopped()) preview.events.onClick?.(event);
              }}
              onKeyDown={(event) => {
                props.onKeyDown?.(event);
                if (!event.isPropagationStopped()) preview.events.onKeyDown?.(event);
              }}
            />
          )}
          {expandable && (
            <MediaToolbar
              expandLabel={t('Expand image')}
              moreLabel={t('More image options')}
              busy={busy}
              onExpand={(event) => preview.expand(imageRef.current, event.currentTarget)}
            >
              <DropdownMenuItem disabled={busy} onClick={() => void run('copy-text')}>
                <Link />
                {t('Copy path')}
              </DropdownMenuItem>
              <DropdownMenuItem disabled={busy} onClick={() => void run('copy-image')}>
                <Copy />
                {t('Copy image')}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem disabled={busy} onClick={() => void run('download-image')}>
                <Download />
                {t('Download original')}
              </DropdownMenuItem>
            </MediaToolbar>
          )}
        </span>
      )}
      {preview.viewer}
    </>
  );
}
