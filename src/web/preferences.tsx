import { useEffect, useState } from 'react';
import { UIProvider } from '../ui/ui-provider';
import { defaultUI, type UIPreferences } from '../shared/preferences';
import { SaveContext } from './preferences-state';
import { api } from './api';
export function PreferencesProvider({ children }: { children: React.ReactNode }) {
  const [ui, setUI] = useState<UIPreferences>(() => ({
    theme: (document.documentElement.dataset.theme as UIPreferences['theme']) ?? defaultUI.theme,
    language:
      (document.documentElement.dataset.language as UIPreferences['language']) ??
      defaultUI.language,
  }));
  useEffect(() => {
    let disposed = false;
    let socket: WebSocket;
    let timer: ReturnType<typeof setTimeout>;
    let delay = 500;
    function connect() {
      if (disposed) return;
      const url = new URL('/api/preferences/stream', location.href);
      url.protocol = 'ws:';
      socket = new WebSocket(url);
      socket.onopen = () => {
        delay = 500;
      };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data as string) as { type: string; ui: UIPreferences };
        if (!disposed && message.type === 'preferences') setUI(message.ui);
      };
      socket.onclose = () => {
        if (disposed) return;
        timer = setTimeout(connect, delay);
        delay = Math.min(delay * 2, 10000);
      };
    }
    connect();
    return () => {
      disposed = true;
      clearTimeout(timer);
      socket.close();
    };
  }, []);
  async function save(patch: Partial<UIPreferences>) {
    await api<{ ui: UIPreferences }>('/api/preferences', {
      method: 'POST',
      body: JSON.stringify({ ui: patch }),
    });
  }
  return (
    <SaveContext.Provider value={save}>
      <UIProvider ui={ui}>{children}</UIProvider>
    </SaveContext.Provider>
  );
}
