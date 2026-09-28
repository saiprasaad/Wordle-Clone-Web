// Connects the game rules to the page: modes, input, persistence and dialogs.

import {
  WORD_LENGTH,
  evaluateGuess,
  gameStatus,
  hardModeViolation,
  isValidWord,
  letterStates,
} from './game.js';
import { PROFILE_SCHEMA, mergeProfiles, readGame, readSettings, sameProfile } from './profile.js';
import { dailyAnswer, msUntilNextPuzzle, puzzleNumber, randomAnswer } from './puzzle.js';
import {
  readDailyRecord,
  readUnlimitedRecord,
  recordDaily,
  recordUnlimited,
  summarizeDaily,
  summarizeUnlimited,
  winPercentage,
} from './stats.js';
import { shareText } from './share.js';
import { definitionUrl, fetchDefinition } from './definition.js';
import * as storage from './storage.js';
import { createSync } from './cloud/sync.js';
import { announce, describeGuess, prefersReducedMotion } from './ui/a11y.js';
import { createBoard } from './ui/board.js';
import { isAnyDialogOpen, setupDialog } from './ui/dialogs.js';
import { createKeyboard } from './ui/keyboard.js';
import { clearToasts, showToast } from './ui/toast.js';

const TITLE = 'Voila';
const PRAISE = ['Legendary', 'Brilliant', 'Excellent', 'Nicely done', 'Well played', 'Just in time'];
const RECENT_WORDS_KEPT = 300;
const DEFINITION_MAX_LENGTH = 180;

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- State ----------

// Identifies this browser in synced stats (see stats.js).
const device = loadDeviceId();
const settings = loadSettings();
const games = { daily: loadDailyGame(puzzleNumber()), unlimited: loadUnlimitedGame() };
const records = loadRecords();
// Letters typed into the current row, kept per mode so switching doesn't lose them.
const inputs = { daily: '', unlimited: '' };
let mode = 'daily';
// True while a guess is being revealed; input is ignored until it finishes.
let busy = false;

function loadDeviceId() {
  const saved = storage.load('device', null);
  if (typeof saved === 'string' && /^[\w-]{1,64}$/.test(saved)) return saved;
  const id = crypto.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
  storage.save('device', id);
  return id;
}

function loadSettings() {
  const saved = storage.load('settings', null) ?? {};
  return {
    ...readSettings(saved),
    // Not synced: each device follows its own system theme unless changed.
    // null follows the operating system setting.
    darkTheme: typeof saved.darkTheme === 'boolean' ? saved.darkTheme : null,
  };
}

function saveSettings() {
  storage.save('settings', settings);
}

/** Changes a setting that follows the player to their other devices. */
function changeSyncedSetting(name, value) {
  settings[name] = value;
  settings.at = Date.now();
  saveSettings();
  sync.changed();
}

function newGame(answer, puzzle = null) {
  return { puzzle, answer, guesses: [], hardMode: false, gaveUp: false, at: 0 };
}

function loadDailyGame(number) {
  const saved = readGame(storage.load('game:daily', null), { daily: true });
  return saved?.puzzle === number ? saved : newGame(dailyAnswer(number), number);
}

function loadUnlimitedGame() {
  return readGame(storage.load('game:unlimited', null), { daily: false }) ?? dealUnlimitedGame();
}

/** Picks a fresh unlimited word and saves it, so a reload keeps the same word. */
function dealUnlimitedGame() {
  const saved = storage.load('recent', []);
  const recent = Array.isArray(saved) ? saved : [];
  // Skip recently played words, and never spoil today's daily word.
  const answer = randomAnswer([...recent, dailyAnswer(puzzleNumber())]);
  storage.save('recent', [...recent, answer].slice(-RECENT_WORDS_KEPT));
  const game = { ...newGame(answer), at: Date.now() };
  storage.save('game:unlimited', game);
  return game;
}

function loadRecords() {
  const savedDaily = storage.load('stats:daily', null);
  const savedUnlimited = storage.load('stats:unlimited', null);
  // Totals saved by the previous version are converted once. The last
  // finished puzzle becomes a real result when its game is still saved.
  const lastGame = readGame(storage.load('game:daily', null), { daily: true });
  const lastResult =
    lastGame && statusOf(lastGame) !== 'playing'
      ? { puzzle: lastGame.puzzle, ...resultOf(lastGame), at: lastGame.at }
      : null;
  const loaded = {
    daily: readDailyRecord(savedDaily, { device, lastResult }),
    unlimited: readUnlimitedRecord(savedUnlimited, { device }),
  };
  if (typeof savedDaily?.played === 'number') storage.save('stats:daily', loaded.daily);
  if (typeof savedUnlimited?.played === 'number') storage.save('stats:unlimited', loaded.unlimited);
  return loaded;
}

function saveGame(which) {
  games[which].at = Date.now();
  storage.save(`game:${which}`, games[which]);
  sync.changed();
}

function statusOf(game) {
  return game.gaveUp ? 'lost' : gameStatus(game.guesses, game.answer);
}

function resultOf(game) {
  return { won: statusOf(game) === 'won', guesses: game.guesses.length, hardMode: game.hardMode };
}

function recordResult(which) {
  const game = games[which];
  const result = { ...resultOf(game), at: Date.now() };
  if (which === 'daily') records.daily = recordDaily(records.daily, game.puzzle, result);
  else records.unlimited = recordUnlimited(records.unlimited, device, result);
  storage.save(`stats:${which}`, records[which]);
}

// ---------- Page elements ----------

const board = createBoard($('board'));
const keyboard = createKeyboard($('keyboard'), handleKey);
const modeSwitch = $('mode-switch');
const newWordButton = $('new-word-button');
const hardModeInput = $('hard-mode');
const darkThemeInput = $('dark-theme');
const highContrastInput = $('high-contrast');
const helpDialog = setupDialog($('help-dialog'));
const settingsDialog = setupDialog($('settings-dialog'));
const statsDialog = setupDialog($('stats-dialog'), {
  onClose() {
    stopCountdown();
    refreshDailyPuzzle();
  },
});
const sync = createSync({
  device,
  getProfile: currentProfile,
  applyProfile,
  onChange: renderAccount,
});

function render() {
  const game = games[mode];
  const playing = statusOf(game) === 'playing';
  board.render(game.guesses, game.answer, playing ? inputs[mode] : '');
  keyboard.update(letterStates(game.guesses, game.answer));
  modeSwitch.querySelector(`input[value="${mode}"]`).checked = true;
  $('puzzle-number').textContent = `#${games.daily.puzzle}`;
  newWordButton.hidden = mode !== 'unlimited';
  disarmGiveUp();
  renderSplash();
}

function updateNewWordButton() {
  const game = games.unlimited;
  const midRound = statusOf(game) === 'playing' && game.guesses.length > 0;
  let label = midRound ? 'Give up and start a new word' : 'New word';
  if (newWordButton.hasAttribute('data-armed')) label = 'Press again to give up and reveal the word';
  newWordButton.setAttribute('aria-label', label);
  newWordButton.title = label;
}

function setBusy(value) {
  busy = value;
  modeSwitch.disabled = value;
  newWordButton.disabled = value;
  if (!busy && pendingProfile) {
    const profile = pendingProfile;
    pendingProfile = null;
    applyProfile(profile);
  }
}

// ---------- Playing ----------

function handleKey(key) {
  if (busy || isAnyDialogOpen()) return;
  const game = games[mode];
  if (statusOf(game) !== 'playing') {
    if (key === 'enter' && mode === 'unlimited') startUnlimitedGame();
    return;
  }
  const row = game.guesses.length;
  const input = inputs[mode];
  if (key === 'enter') {
    submitGuess();
  } else if (key === 'backspace') {
    if (!input) return;
    inputs[mode] = input.slice(0, -1);
    board.setInput(row, inputs[mode]);
  } else if (input.length < WORD_LENGTH) {
    inputs[mode] = input + key;
    board.setInput(row, inputs[mode]);
    board.pop(row, input.length);
  }
}

async function submitGuess() {
  const which = mode;
  const game = games[which];
  const row = game.guesses.length;
  const guess = inputs[which];

  if (guess.length < WORD_LENGTH) return rejectGuess(row, 'Needs five letters');
  if (!isValidWord(guess)) return rejectGuess(row, 'Not a word we know');
  // Hard mode is locked in for the round once the first guess is made.
  const hardMode = row === 0 ? settings.hardMode : game.hardMode;
  const violation = hardMode && hardModeViolation(guess, game.guesses, game.answer);
  if (violation) return rejectGuess(row, violation);

  game.hardMode = hardMode;
  game.guesses.push(guess);
  inputs[which] = '';
  updateNewWordButton();
  const status = statusOf(game);
  if (status !== 'playing') recordResult(which);
  // Saved before the animation so a reload mid-reveal keeps the guess.
  saveGame(which);

  setBusy(true);
  const evaluation = evaluateGuess(guess, game.answer);
  await board.reveal(row, guess, evaluation);
  keyboard.update(letterStates(game.guesses, game.answer));
  const summary = describeGuess(guess, evaluation);

  if (status === 'won') {
    showToast(PRAISE[row], { duration: 1800, silent: true });
    announce(`${summary} ${PRAISE[row]}! You solved it in ${row + 1}.`);
    await board.bounce(row);
    await wait(600);
  } else if (status === 'lost') {
    showToast(game.answer.toUpperCase(), { duration: 2600, silent: true });
    announce(`${summary} Out of guesses. The word was ${game.answer.toUpperCase()}.`);
    await wait(1800);
  } else {
    announce(summary);
  }
  setBusy(false);
  if (status !== 'playing') openStats();
}

function rejectGuess(row, message) {
  showToast(message);
  board.shake(row);
}

// ---------- Modes ----------

function switchMode(next) {
  if (next === mode) return;
  mode = next;
  clearToasts();
  refreshDailyPuzzle();
  render();
}

function startUnlimitedGame() {
  games.unlimited = dealUnlimitedGame();
  inputs.unlimited = '';
  sync.changed();
  statsDialog.close();
  clearToasts();
  mode = 'unlimited';
  render();
}

// The unlimited "new word" button doubles as a give-up button mid-round, which
// needs a second press to confirm and counts as a loss.
let giveUpTimer = null;

function onNewWordClick() {
  const game = games.unlimited;
  const midRound = statusOf(game) === 'playing' && game.guesses.length > 0;
  if (!midRound) return startUnlimitedGame();
  if (newWordButton.hasAttribute('data-armed')) return giveUp();
  newWordButton.dataset.armed = '';
  updateNewWordButton();
  showToast('Press again to give up and reveal the word', { duration: 2600 });
  giveUpTimer = setTimeout(disarmGiveUp, 3000);
}

function disarmGiveUp() {
  clearTimeout(giveUpTimer);
  delete newWordButton.dataset.armed;
  updateNewWordButton();
}

function giveUp() {
  const game = games.unlimited;
  game.gaveUp = true;
  inputs.unlimited = '';
  recordResult('unlimited');
  saveGame('unlimited');
  clearToasts();
  render();
  openStats();
}

/**
 * Moves to today's puzzle once the date changes, unless the player is partway
 * through the previous one: they can finish it first.
 */
function refreshDailyPuzzle() {
  const today = puzzleNumber();
  const game = games.daily;
  // An open stats dialog still shows the old result; it refreshes on close.
  if (game.puzzle === today || busy || statsDialog.isOpen) return;
  if (statusOf(game) === 'playing' && game.guesses.length > 0) return;
  games.daily = loadDailyGame(today);
  inputs.daily = '';
  render();
}

let midnightTimer = null;

function scheduleMidnightRefresh() {
  clearTimeout(midnightTimer);
  midnightTimer = setTimeout(() => {
    refreshDailyPuzzle();
    scheduleMidnightRefresh();
  }, msUntilNextPuzzle() + 1000);
}

// ---------- Statistics ----------

let countdownTimer = null;

function openStats() {
  renderStats();
  statsDialog.open();
  startCountdown();
}

function renderStats() {
  const game = games[mode];
  const summary =
    mode === 'daily' ? summarizeDaily(records.daily, puzzleNumber()) : summarizeUnlimited(records.unlimited);
  const status = statusOf(game);
  const over = status !== 'playing';

  $('stats-mode').textContent = mode === 'daily' ? 'Daily' : 'Unlimited';
  $('stat-played').textContent = summary.played;
  $('stat-win').textContent = winPercentage(summary);
  $('stat-streak').textContent = summary.currentStreak;
  $('stat-max').textContent = summary.maxStreak;
  renderDistribution(summary, status === 'won' ? game.guesses.length : null);

  $('result').hidden = !over;
  if (over) renderResult(game, status);

  $('countdown').hidden = mode !== 'daily';
  $('share-button').hidden = !over;
  const playButton = $('play-button');
  playButton.textContent = mode === 'daily' ? 'Play Unlimited' : 'New word';
  playButton.hidden = mode === 'unlimited' && !over;
}

function renderDistribution(summary, highlight) {
  const most = Math.max(...summary.distribution);
  const items = summary.distribution.map((count, i) => {
    const guesses = i + 1;
    const item = document.createElement('li');
    const label = document.createElement('span');
    label.textContent = guesses;
    label.setAttribute('aria-hidden', 'true');
    const bar = document.createElement('span');
    bar.className = 'distribution-bar';
    bar.style.setProperty('--share', most ? Math.round((count / most) * 100) : 0);
    if (highlight === guesses) bar.dataset.highlight = '';
    const description = document.createElement('span');
    description.className = 'visually-hidden';
    description.textContent = ` ${count === 1 ? 'win' : 'wins'} in ${guesses} ${guesses === 1 ? 'guess' : 'guesses'}`;
    bar.append(String(count), description);
    item.append(label, bar);
    return item;
  });
  $('distribution').replaceChildren(...items);
  $('distribution').hidden = summary.played === 0;
  $('distribution-empty').hidden = summary.played > 0;
}

function renderResult(game, status) {
  const answer = game.answer.toUpperCase();
  $('result-title').textContent =
    status === 'won' ? `${PRAISE[game.guesses.length - 1]}!` : 'The word was';
  $('result-answer-label').textContent = `The word was ${answer}.`;
  const tiles = [...answer].map((letter) => {
    const tile = document.createElement('span');
    tile.className = 'tile';
    tile.dataset.state = status === 'won' ? 'correct' : 'absent';
    tile.textContent = letter;
    return tile;
  });
  $('answer-tiles').replaceChildren(...tiles);
  showDefinition(game.answer);
}

let definitionRequest = 0;

async function showDefinition(word) {
  const request = ++definitionRequest;
  const container = $('definition');
  container.textContent = 'Looking up the definition…';
  const definition = await fetchDefinition(word);
  if (request !== definitionRequest) return;

  const parts = [];
  if (definition) {
    if (definition.partOfSpeech) {
      const partOfSpeech = document.createElement('em');
      partOfSpeech.textContent = definition.partOfSpeech;
      parts.push(partOfSpeech);
    }
    const text =
      definition.text.length > DEFINITION_MAX_LENGTH
        ? `${definition.text.slice(0, DEFINITION_MAX_LENGTH).trimEnd()}…`
        : definition.text;
    parts.push(`${text} `);
  }
  const link = document.createElement('a');
  link.href = definitionUrl(word);
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.textContent = definition ? 'More on Wiktionary' : `Look up “${word}” on Wiktionary`;
  const newTab = document.createElement('span');
  newTab.className = 'visually-hidden';
  newTab.textContent = ' (opens in a new tab)';
  link.append(newTab);
  parts.push(link);
  container.replaceChildren(...parts);
}

function startCountdown() {
  stopCountdown();
  const tick = () => {
    const ready = puzzleNumber() !== games.daily.puzzle;
    $('countdown-time').textContent = ready ? 'Ready!' : formatDuration(msUntilNextPuzzle());
  };
  tick();
  countdownTimer = setInterval(tick, 1000);
}

function stopCountdown() {
  clearInterval(countdownTimer);
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  return [Math.floor(seconds / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map((n) => String(n).padStart(2, '0'))
    .join(':');
}

// ---------- Sharing ----------

async function shareResults() {
  const game = games[mode];
  const text = shareText({
    title: mode === 'daily' ? `${TITLE} #${game.puzzle}` : `${TITLE} Unlimited`,
    guesses: game.guesses,
    answer: game.answer,
    won: statusOf(game) === 'won',
    hardMode: game.hardMode,
    highContrast: settings.highContrast,
    darkTheme: isDarkTheme(),
    url: new URL('./', window.location.href).href,
  });

  // The share sheet suits phones; desktops get the clipboard.
  if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ text });
      return;
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }
  const copied = await copyText(text);
  showToast(copied ? 'Copied results to clipboard' : 'Could not copy your results');
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers and insecure origins: fall back to a hidden textarea.
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', '');
    textarea.className = 'visually-hidden';
    // Outside an open modal everything is inert, so the textarea goes inside it.
    (document.querySelector('dialog[open]') ?? document.body).append(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    textarea.remove();
    return copied;
  }
}

// ---------- Settings ----------

const systemDarkTheme = window.matchMedia('(prefers-color-scheme: dark)');

function isDarkTheme() {
  return settings.darkTheme ?? systemDarkTheme.matches;
}

function applyTheme() {
  const root = document.documentElement;
  root.dataset.theme = isDarkTheme() ? 'dark' : 'light';
  if (settings.highContrast) root.dataset.contrast = 'high';
  else delete root.dataset.contrast;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', isDarkTheme() ? '#121213' : '#ffffff');
}

function syncSettingsInputs() {
  hardModeInput.checked = settings.hardMode;
  darkThemeInput.checked = isDarkTheme();
  highContrastInput.checked = settings.highContrast;
}

function onHardModeChange() {
  const game = games[mode];
  const midRound = statusOf(game) === 'playing' && game.guesses.length > 0;
  if (hardModeInput.checked && midRound) {
    hardModeInput.checked = false;
    showToast('Turn on Hard Mode before your first guess', { duration: 2400 });
    return;
  }
  changeSyncedSetting('hardMode', hardModeInput.checked);
  // Turning hard mode off mid-round relaxes the current round too.
  if (!settings.hardMode && midRound && game.hardMode) {
    game.hardMode = false;
    saveGame(mode);
  }
}

// ---------- Accounts and sync ----------

const SYNC_STATUS = {
  connecting: 'Connecting…',
  syncing: 'Syncing…',
  synced: 'Your stats and progress are synced.',
  offline: "You're offline. Changes will sync when you reconnect.",
  error: "Couldn't sync just now. We'll keep trying.",
};
const CANCELLED_SIGN_IN = new Set(['auth/popup-closed-by-user', 'auth/cancelled-popup-request']);

// A profile that arrives mid-animation waits until the reveal finishes.
let pendingProfile = null;

function currentProfile() {
  return {
    schema: PROFILE_SCHEMA,
    settings: { hardMode: settings.hardMode, highContrast: settings.highContrast, at: settings.at },
    daily: records.daily,
    unlimited: records.unlimited,
    games: { daily: games.daily, unlimited: games.unlimited },
  };
}

/** Adopts a profile merged with other devices, keeping anything done here meanwhile. */
function applyProfile(incoming) {
  if (busy) {
    pendingProfile = incoming;
    return;
  }
  const merged = mergeProfiles(currentProfile(), incoming);
  let changed = false;
  if (!sameProfile(merged.settings, currentProfile().settings)) {
    Object.assign(settings, merged.settings);
    saveSettings();
    applyTheme();
    syncSettingsInputs();
  }
  for (const which of ['daily', 'unlimited']) {
    if (!sameProfile(merged[which], records[which])) {
      records[which] = merged[which];
      storage.save(`stats:${which}`, records[which]);
      changed = true;
    }
    const game = merged.games[which];
    // Another device may already be on tomorrow's puzzle; that waits until
    // it's tomorrow here too.
    const usable =
      game && (which === 'unlimited' || (game.puzzle >= games.daily.puzzle && game.puzzle <= puzzleNumber()));
    if (usable && !sameProfile(game, games[which])) {
      games[which] = { ...game, guesses: [...game.guesses] };
      inputs[which] = '';
      storage.save(`game:${which}`, games[which]);
      changed = true;
    }
  }
  if (changed) {
    render();
    if (statsDialog.isOpen) renderStats();
  }
  // Anything changed here while the sync was running still needs uploading.
  if (!sameProfile(merged, incoming)) sync.changed();
}

function renderAccount({ available, status, user }) {
  renderSplash();
  $('account').hidden = !available;
  $('sync-prompt').hidden = !available || Boolean(user);
  if (!available) return;
  $('account-signed-out').hidden = Boolean(user);
  $('account-signed-in').hidden = !user;
  $('sign-in-button').disabled = status === 'connecting';
  if (!user) return;
  $('account-avatar').textContent = (user.name || user.email).charAt(0).toUpperCase();
  $('account-name').textContent = user.name || user.email;
  $('account-email').textContent = user.name ? user.email : '';
  $('account-status').textContent = SYNC_STATUS[status] ?? '';
}

async function signIn() {
  try {
    await sync.signIn();
    showToast('Signed in. Your progress now syncs across devices.', { duration: 2600 });
  } catch (error) {
    if (CANCELLED_SIGN_IN.has(error?.code)) return;
    showToast(
      error?.code === 'auth/popup-blocked'
        ? 'The sign-in window was blocked. Tap Sign in again.'
        : "Couldn't sign in. Please try again.",
      { duration: 3000 },
    );
  }
}

async function signOut() {
  await sync.signOut();
  showToast('Signed out. Your progress stays on this device.', { duration: 2600 });
}

// Deleting the account needs a second tap to confirm.
let deleteTimer = null;

async function onDeleteAccountClick() {
  const button = $('delete-account-button');
  if (!button.hasAttribute('data-armed')) {
    button.dataset.armed = '';
    button.textContent = 'Tap again to delete your account and cloud data';
    deleteTimer = setTimeout(disarmDelete, 4000);
    return;
  }
  disarmDelete();
  try {
    await sync.deleteAccount();
    showToast('Your account and cloud data were deleted.', { duration: 3000 });
  } catch (error) {
    if (CANCELLED_SIGN_IN.has(error?.code)) return;
    showToast("Couldn't delete your account. Please try again.", { duration: 3000 });
  }
}

function disarmDelete() {
  clearTimeout(deleteTimer);
  const button = $('delete-account-button');
  delete button.dataset.armed;
  button.textContent = 'Delete account';
}

// ---------- Welcome screen ----------

const splash = $('splash');
const splashActions = { primary: playDaily, secondary: null };
let splashTimer = null;

/** Tailors the welcome screen to today's puzzle and the player's account. */
function renderSplash() {
  if (splash.hidden) return;
  const game = games.daily;
  const status = statusOf(game);
  const { available, status: syncStatus, user } = sync.state;

  const greeting = $('splash-greeting');
  greeting.hidden = !user;
  if (user) greeting.textContent = `Welcome back, ${(user.name || user.email).split(/[\s@]/)[0]}!`;

  // The word joiner keeps "five-letter" from breaking across lines.
  let message = 'Find the hidden five-\u2060letter word in six guesses.';
  let primary = ['Play', playDaily];
  if (status === 'won') {
    message = "You solved today's word. Nicely done!";
    primary = ['See stats', showDailyStats];
  } else if (status === 'lost') {
    message = 'Not this time. A new word arrives at midnight.';
    primary = ['See stats', showDailyStats];
  } else if (game.guesses.length > 0) {
    const made = game.guesses.length;
    message = `${made} ${made === 1 ? 'guess' : 'guesses'} down, ${6 - made} to go. You've got this.`;
    primary = ['Continue', playDaily];
  }
  $('splash-message').textContent = message;
  $('splash-primary').textContent = primary[0];
  splashActions.primary = primary[1];

  const secondary = $('splash-secondary');
  if (available && !user) {
    secondary.replaceChildren($('sign-in-button').querySelector('.google-logo').cloneNode(true), 'Sign in');
    secondary.disabled = syncStatus === 'connecting';
    splashActions.secondary = signIn;
  } else if (status !== 'playing') {
    secondary.replaceChildren('Play Unlimited');
    secondary.disabled = false;
    splashActions.secondary = playUnlimited;
  } else {
    splashActions.secondary = null;
  }
  secondary.hidden = !splashActions.secondary;

  $('splash-number').textContent = `Daily puzzle #${game.puzzle.toLocaleString()}`;
  // The puzzle's own date, which is yesterday's while an unfinished game
  // carries on past midnight.
  const date = new Date();
  date.setDate(date.getDate() - (puzzleNumber() - game.puzzle));
  $('splash-date').textContent = new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(date);

  // Once today's puzzle is done, say when the next one arrives.
  const next = $('splash-next');
  next.hidden = status === 'playing';
  clearTimeout(splashTimer);
  if (!next.hidden) {
    next.textContent = `Next puzzle in ${formatWait(msUntilNextPuzzle())}`;
    splashTimer = setTimeout(renderSplash, 30_000);
  }
}

/** Time left, rounded up to the minute: "7h 12m", "12h" or "42m". */
function formatWait(ms) {
  const minutes = Math.max(1, Math.ceil(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  if (!hours) return `${minutes}m`;
  return minutes % 60 ? `${hours}h ${minutes % 60}m` : `${hours}h`;
}

function dismissSplash() {
  clearTimeout(splashTimer);
  splash.inert = true; // Ignore further taps while it fades out.
  for (const element of document.querySelectorAll('.app-header, .game')) element.inert = false;
  const hide = () => {
    splash.hidden = true;
    delete splash.dataset.leaving;
  };
  if (prefersReducedMotion()) {
    hide();
  } else {
    splash.dataset.leaving = '';
    setTimeout(hide, 220);
  }
}

function playDaily() {
  dismissSplash();
  switchMode('daily');
  if (!storage.load('seen-help', false)) {
    storage.save('seen-help', true);
    helpDialog.open();
  }
}

function showDailyStats() {
  dismissSplash();
  switchMode('daily');
  openStats();
}

function playUnlimited() {
  dismissSplash();
  if (statusOf(games.unlimited) === 'playing') switchMode('unlimited');
  else startUnlimitedGame();
}

// ---------- Keyboard and lifecycle ----------

function onKeyDown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (isAnyDialogOpen()) return; // Dialogs handle their own keys.
  if (!splash.hidden) {
    // Enter starts the game from the welcome screen, unless a button has focus.
    if (event.key === 'Enter' && !event.repeat && !splash.inert && document.activeElement === document.body) {
      event.preventDefault();
      splashActions.primary();
    }
    return;
  }
  const key = gameKey(event);
  if (!key) return;

  const active = document.activeElement;
  const focusedControl =
    active instanceof HTMLElement && active !== document.body && !active.closest('#keyboard')
      ? active
      : null;
  if (key === 'enter') {
    // A focused button or link keeps its own Enter behavior.
    if (focusedControl?.matches('button, a[href], summary')) return;
    event.preventDefault();
  } else {
    if (key === 'backspace') event.preventDefault();
    // Typing takes focus back to the game, so Enter then submits the guess.
    focusedControl?.blur();
  }
  handleKey(key);
}

function gameKey(event) {
  if (event.key === 'Enter') return 'enter';
  if (event.key === 'Backspace') return 'backspace';
  if (/^[a-z]$/i.test(event.key)) return event.key.toLowerCase();
  // Letters from other scripts (Cyrillic, Greek…): use the key's physical position.
  if (/^\p{L}$/u.test(event.key) && /^Key[A-Z]$/.test(event.code)) {
    return event.code.slice(3).toLowerCase();
  }
  return null;
}

/** Keeps several open tabs in step instead of letting them overwrite each other. */
function onStorageChange(key) {
  if (busy) return;
  if (key === 'settings') {
    Object.assign(settings, loadSettings());
    applyTheme();
    syncSettingsInputs();
  } else if (key === 'stats:daily') {
    records.daily = readDailyRecord(storage.load(key, null), { device });
    if (statsDialog.isOpen) renderStats();
  } else if (key === 'stats:unlimited') {
    records.unlimited = readUnlimitedRecord(storage.load(key, null), { device });
    if (statsDialog.isOpen) renderStats();
  } else if (key === 'game:daily' || key === 'game:unlimited') {
    const which = key.slice('game:'.length);
    const saved = readGame(storage.load(key, null), { daily: which === 'daily' });
    if (!saved || (which === 'daily' && saved.puzzle !== games.daily.puzzle)) return;
    games[which] = saved;
    inputs[which] = '';
    if (mode === which) render();
    if (statsDialog.isOpen) renderStats();
  } else if (key === 'account' && storage.load('account', false)) {
    // Signed in from another tab.
    sync.start();
  }
}

export function start() {
  applyTheme();
  syncSettingsInputs();
  render();

  document.addEventListener('keydown', onKeyDown);
  modeSwitch.addEventListener('change', (event) => switchMode(event.target.value));
  newWordButton.addEventListener('click', onNewWordClick);
  $('help-button').addEventListener('click', () => helpDialog.open());
  $('stats-button').addEventListener('click', openStats);
  $('settings-button').addEventListener('click', () => {
    syncSettingsInputs();
    settingsDialog.open();
    if (!sync.state.user) sync.prepare();
  });
  $('share-button').addEventListener('click', shareResults);
  $('play-button').addEventListener('click', () => {
    if (mode === 'unlimited' || statusOf(games.unlimited) !== 'playing') startUnlimitedGame();
    else {
      statsDialog.close();
      switchMode('unlimited');
    }
  });
  hardModeInput.addEventListener('change', onHardModeChange);
  darkThemeInput.addEventListener('change', () => {
    settings.darkTheme = darkThemeInput.checked;
    saveSettings();
    applyTheme();
  });
  highContrastInput.addEventListener('change', () => {
    changeSyncedSetting('highContrast', highContrastInput.checked);
    applyTheme();
  });
  systemDarkTheme.addEventListener('change', () => {
    if (settings.darkTheme !== null) return;
    applyTheme();
    syncSettingsInputs();
  });
  storage.onExternalChange(onStorageChange);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    refreshDailyPuzzle();
    sync.refresh();
  });
  window.addEventListener('focus', refreshDailyPuzzle);
  window.addEventListener('online', () => sync.refresh());
  scheduleMidnightRefresh();

  $('sign-in-button').addEventListener('click', signIn);
  const promptButton = $('sync-prompt-button');
  promptButton.addEventListener('click', signIn);
  // Start loading sign-in as soon as the button looks likely to be pressed.
  for (const event of ['pointerenter', 'focus']) {
    promptButton.addEventListener(event, () => sync.prepare(), { once: true });
  }
  $('sign-out-button').addEventListener('click', signOut);
  $('delete-account-button').addEventListener('click', onDeleteAccountClick);

  const splashSecondary = $('splash-secondary');
  $('splash-primary').addEventListener('click', () => splashActions.primary());
  splashSecondary.addEventListener('click', () => splashActions.secondary?.());
  for (const event of ['pointerenter', 'pointerdown', 'focus']) {
    splashSecondary.addEventListener(event, () => {
      if (splashActions.secondary === signIn) sync.prepare();
    });
  }
  $('splash-help').addEventListener('click', () => {
    storage.save('seen-help', true);
    helpDialog.open();
  });
  renderAccount(sync.state);
  sync.start();
}
