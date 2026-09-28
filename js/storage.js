// localStorage with JSON encoding. Storage can be full, disabled, or blocked
// (private browsing, strict privacy settings), so failures are swallowed and
// the game keeps working without persistence.

const PREFIX = 'wordle-clone:';

export function load(key, fallback) {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function save(key, value) {
  try {
    localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Ignore: progress simply won't survive a reload.
  }
}

/** Calls `callback(key)` when another tab changes one of our keys. */
export function onExternalChange(callback) {
  window.addEventListener('storage', (event) => {
    if (event.key?.startsWith(PREFIX)) callback(event.key.slice(PREFIX.length));
  });
}
