// Applies the saved theme before the first paint so the page never flashes the
// wrong colors. Runs as a classic blocking script; app.js keeps it updated.
(function () {
  let settings = {};
  try {
    settings = JSON.parse(localStorage.getItem('wordle-clone:settings')) || {};
  } catch {
    // Storage unavailable: fall back to the system theme.
  }
  const dark =
    typeof settings.darkTheme === 'boolean'
      ? settings.darkTheme
      : matchMedia('(prefers-color-scheme: dark)').matches;
  const root = document.documentElement;
  root.dataset.theme = dark ? 'dark' : 'light';
  if (settings.highContrast) root.dataset.contrast = 'high';
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', dark ? '#121213' : '#ffffff');
})();
