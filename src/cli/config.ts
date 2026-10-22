import { call } from './client.js';
export function getConfig() {
  return call('/api/preferences', { start: true });
}
export function setConfig(key: string, value: string) {
  if (key !== 'ui.theme' && key !== 'ui.language')
    throw Object.assign(new Error('Expected ui.theme or ui.language.'), {
      code: 'INVALID_ARGUMENT',
    });
  return call('/api/preferences', {
    method: 'POST',
    start: true,
    body: { ui: { [key.slice(3)]: value } },
  });
}
