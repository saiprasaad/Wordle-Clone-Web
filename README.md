# Wordle Clone

Guess the hidden five-letter word in six tries. A fast, accessible word game
that runs in any modern browser, installs like an app, and works offline.

![Gameplay in light mode, the result card in dark mode, and high contrast mode](docs/screenshot.png)

## Features

- **Daily puzzle.** Everyone gets the same word each day, and a new one arrives at local midnight.
- **Unlimited mode.** Play as many random words as you like. It never repeats recent words or
  spoils today's daily word, and you can give up on a tough one.
- **Faithful rules.** Duplicate letters are scored the way the original game scores them, and
  guesses are checked against a dictionary of about 8,900 words.
- **Hard mode.** Any revealed hints must be used in later guesses.
- **Statistics.** Games played, win rate, current and best streaks, and a guess distribution,
  kept separately for each mode.
- **Share.** Posts a spoiler-free emoji grid through the share sheet on phones, or copies it to
  the clipboard on desktops.
- **Learn the word.** After each game, a short definition with a link to Wiktionary.
- **Dark theme and high contrast colors.** The theme follows your device until you choose one.
- **Plays anywhere.** Physical or on-screen keyboard, phones in portrait or landscape, tablets
  and desktops.
- **Accessible.** Screen reader announcements for every guess, labelled tiles and keys, full
  keyboard support, reduced motion support, and no axe-core violations.
- **Remembers everything.** Progress, stats and settings survive reloads and stay in sync across
  open tabs.
- **Installable and offline.** A service worker caches the game so it works without a network.

It has no build step and no runtime dependencies: plain HTML, CSS and JavaScript modules, about
20 KB gzipped plus 25 KB for the word list (the previous Flutter build downloaded several
megabytes).

## Play locally

Any static file server works. The repository includes a tiny one:

```sh
npm start            # serves http://localhost:8080/
```

ES modules and the service worker need `http://`, so opening `index.html` straight from disk won't
work.

## Tests

```sh
npm install                          # installs Playwright for the browser tests
npm test                             # unit tests for the rules, stats, sharing and word lists
npx playwright install chromium      # first run only
npm run test:e2e                     # plays the game in desktop and mobile Chromium
```

GitHub Actions runs both suites on every push and pull request.

## Deploy

The site is static, and every path is relative, so it runs from a domain root or a subfolder.
For GitHub Pages, open **Settings → Pages** and choose **Deploy from a branch**, then `main` and
`/ (root)`. It will then be available at `https://<user>.github.io/Wordle-Clone-Web/`.

## Project layout

```
index.html              page structure and dialogs
styles.css              layout, themes and animations
sw.js                   offline support (network first, cache fallback)
js/
  main.js               entry point
  app.js                game flow, modes, persistence, dialogs and settings
  game.js               rules: scoring, validation and hard mode (no DOM)
  puzzle.js             daily puzzle numbers and answer selection (no DOM)
  stats.js              statistics and streaks (no DOM)
  share.js              emoji results grid (no DOM)
  words.js              answer and guess lists
  definition.js         dictionary lookup after a game
  storage.js            localStorage helpers
  theme.js              applies the theme before first paint
  ui/                   board, keyboard, dialogs, toasts and accessibility helpers
tests/unit/             Node test runner specs
tests/e2e/              Playwright specs
scripts/                local server and icon renderer
```

## Word lists

`js/words.js` has two alphabetical, space-separated lists that are easy to edit by hand:

- `ANSWERS`: 1,933 common words that can be solutions. Plurals, simple past tenses, slang
  contractions, proper nouns and offensive words are left out.
- `ALLOWED`: every other word accepted as a guess.

They come from [SCOWL](http://wordlist.aspell.net/) and the public domain ENABLE list. Answers
were chosen by word frequency using [wordfreq](https://github.com/rspeer/wordfreq), then reviewed
by hand. The daily order is a fixed shuffle of `ANSWERS`, so adding or removing a word changes
future puzzles. `npm test` checks the lists' format. See [NOTICE.md](NOTICE.md) for licenses.

## Privacy

There is no tracking and no account. Everything is stored in your browser's `localStorage`. The
only network request to another site is the definition lookup at the end of a game, which sends
the answer word to [dictionaryapi.dev](https://dictionaryapi.dev/).

## Credits

Inspired by [Wordle](https://www.nytimes.com/games/wordle/) by Josh Wardle, now published by The
New York Times. This is an independent fan project with no affiliation. The original Flutter
version of this clone lives in [saiprasaad/Wordle-Clone](https://github.com/saiprasaad/Wordle-Clone).
