// Looks up a short definition of the answer after a game. This is a nice extra
// only: any failure (offline, unknown word, slow API) resolves to null.

const API = 'https://api.dictionaryapi.dev/api/v2/entries/en/';
const TIMEOUT_MS = 6000;
const cache = new Map();

export function definitionUrl(word) {
  return `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`;
}

/** Resolves to `{ partOfSpeech, text }` or null. */
export function fetchDefinition(word) {
  if (!cache.has(word)) {
    const request = lookUp(word).catch(() => {
      cache.delete(word); // Network trouble: allow a retry later.
      return null;
    });
    cache.set(word, request);
  }
  return cache.get(word);
}

async function lookUp(word) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(API + encodeURIComponent(word), { signal: controller.signal });
    if (!response.ok) return null;
    const entries = await response.json();
    for (const entry of Array.isArray(entries) ? entries : []) {
      for (const meaning of entry.meanings ?? []) {
        const text = meaning.definitions?.[0]?.definition;
        if (text) return { partOfSpeech: meaning.partOfSpeech ?? '', text };
      }
    }
    return null;
  } finally {
    clearTimeout(timer);
  }
}
