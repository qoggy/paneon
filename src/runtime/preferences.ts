import { readFileSync, writeFileSync, renameSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { defaultUI, type UIPreferences } from '../shared/preferences.js';
import { PaneonError } from '../shared/types.js';

export class Preferences {
  private config: Record<string, unknown>;
  ui: UIPreferences;
  private home: string;
  constructor(home: string) {
    this.home = home;
    try {
      this.config = JSON.parse(readFileSync(join(home, 'config.json'), 'utf8')) as Record<
        string,
        unknown
      >;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      this.config = {};
    }
    this.ui = { ...defaultUI, ...this.patch(this.config.ui ?? {}) };
  }
  get port(): number {
    return (this.config.server as { port?: number } | undefined)?.port ?? 49321;
  }
  private patch(value: unknown): Partial<UIPreferences> {
    const ui = value as Partial<UIPreferences>;
    if (
      !ui ||
      typeof ui !== 'object' ||
      (ui.theme !== undefined && ui.theme !== 'light' && ui.theme !== 'dark') ||
      (ui.language !== undefined && ui.language !== 'en' && ui.language !== 'zh-CN')
    )
      throw new PaneonError(
        'INVALID_ARGUMENT',
        'UI preferences require theme light/dark and language en/zh-CN.',
      );
    return {
      ...(ui.theme === undefined ? {} : { theme: ui.theme }),
      ...(ui.language === undefined ? {} : { language: ui.language }),
    };
  }
  save(value: unknown) {
    const ui = { ...this.ui, ...this.patch(value) };
    const config = { ...this.config, ui: { ...(this.config.ui as object), ...ui } };
    mkdirSync(this.home, { recursive: true, mode: 0o700 });
    const temporary = join(this.home, `config-${randomUUID()}.tmp`);
    try {
      writeFileSync(temporary, JSON.stringify(config, null, 2) + '\n', { mode: 0o600 });
      renameSync(temporary, join(this.home, 'config.json'));
    } finally {
      rmSync(temporary, { force: true });
    }
    this.config = config;
    this.ui = ui;
    return { ui };
  }
}
