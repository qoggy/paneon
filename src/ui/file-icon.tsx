import { useUI } from './use-ui';
import { cn } from './utils';
import { fileIconAsset, resolveFileIcon } from './file-icon-model';

// Vite embeds the upstream SVGs in the distributed UI modules. No CDN or local
// file endpoint is needed. Folder assets are outside this component's scope.
const icons = import.meta.glob<string>(
  [
    '../../node_modules/material-icon-theme/icons/*.svg',
    '!../../node_modules/material-icon-theme/icons/folder*.svg',
  ],
  { eager: true, query: '?url', import: 'default' },
);

export type FileIconProps = {
  /** File name or path, used only to choose an icon; the file is not read. */
  path: string;
  className?: string;
};

export function FileIcon({ path, className }: FileIconProps) {
  const { theme } = useUI();
  const icon = resolveFileIcon(path, theme);
  return (
    <img
      src={icons[`../../node_modules/material-icon-theme/icons/${fileIconAsset(icon)}`]}
      alt=""
      aria-hidden="true"
      draggable={false}
      className={cn('size-4 shrink-0', className)}
    />
  );
}
