import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';

const root = new URL('../../', import.meta.url);
const source = readFileSync(new URL('sw.js', root), 'utf8');
const shell = JSON.parse(
  source
    .match(/const APP_SHELL = (\[[^\]]*\]);/)[1]
    .replaceAll("'", '"')
    .replace(/,\s*\]/, ']'),
);

function scriptsIn(directory) {
  return readdirSync(new URL(directory, root), { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory()
      ? scriptsIn(`${directory}${entry.name}/`)
      : entry.name.endsWith('.js')
        ? [`${directory}${entry.name}`]
        : [],
  );
}

test('every precached file exists', () => {
  const missing = shell.filter((path) => !existsSync(new URL(path === './' ? 'index.html' : path, root)));
  assert.deepEqual(missing, []);
});

test('every script and stylesheet the game loads is precached for offline play', () => {
  const needed = [...scriptsIn('js/'), 'styles.css', 'manifest.webmanifest'];
  assert.deepEqual(
    needed.filter((path) => !shell.includes(path)),
    [],
  );
});
