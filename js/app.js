// Connects the game rules to the page: modes, input, persistence and dialogs.

import {
  MAX_GUESSES,
  WORD_LENGTH,
  evaluateGuess,
  gameStatus,
  hardModeViolation,
  isValidWord,
  letterStates,
} from './game.js';
import { dailyAnswer, msUntilNextPuzzle, puzzleNumber, randomAnswer } from './puzzle.js';
import { currentStreak, normalizeStats, recordGame, winPercentage } from './stats.js';
import { shareText } from './share.js';
import { definitionUrl, fetchDefinition } from './definition.js';
import * as storage from './storage.js';
import { announce, describeGuess } from './ui/a11y.js';
import { createBoard } from './ui/board.js';
import { isAnyDialogOpen, setupDialog } from './ui/dialogs.js';
import { createKeyboard } from './ui/keyboard.js';
import { clearToasts, showToast } from './ui/toast.js';

const TITLE = 'Wordle Clone';
const PRAISE = ['Genius', 'Magnificent', 'Impressive', 'Splendid', 'Great', 'Phew'];
const RECENT_WORDS_KEPT = 300;
const DEFINITION_MAX_LENGTH = 180;

const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ---------- State ----------

const settings = loadSettings();
const stats = {
  daily: normalizeStats(storage.load('stats:daily', null)),
  unlimited: normalizeStats(storage.load('stats:unlimited', null)),
};
const games = { daily: loadDailyGame(puzzleNumber()), unlimited: loadUnlimitedGame() };
// Letters typed into the current row, kept per mode so switching doesn't lose them.
const inputs = { daily: '', unlimited: '' };
let mode = 'daily';
// True while a guess is being revealed; input is ignored until it finishes.
let busy = false;

function loadSettings() {
  const saved = storage.load('settings', null) ?? {};
  return {
    hardMode: saved.hardMode === true,
    // null follows the operating system setting.
    darkTheme: typeof saved.darkTheme === 'boolean' ? saved.darkTheme : null,
    highContrast: saved.highContrast === true,
  };
}

function saveSettings() {
  storage.save('settings', settings);
}

/** Saved games come from localStorage, so check them before trusting them. */
function isUsableGame(saved) {
  if (!saved || typeof saved.answer !== 'string' || !isValidWord(saved.answer)) return false;
  const { guesses } = saved;
  if (!Array.isArray(guesses) || guesses.length > MAX_GUESSES) return false;
  if (!guesses.every((guess) => typeof guess === 'string' && isValidWord(guess))) return false;
  const winningGuess = guesses.indexOf(saved.answer);
  return winningGuess === -1 || winningGuess === guesses.length - 1;
}

function newGame(answer, puzzle = null) {
  return { puzzle, answer, guesses: [], hardMode: false, gaveUp: false };
}

function restoreGame(saved, puzzle) {
  return {
    ...newGame(saved.answer, puzzle),
    guesses: [...saved.guesses],
    hardMode: saved.hardMode === true,
    gaveUp: saved.gaveUp === true,
  };
}

function loadDailyGame(number) {
  const saved = storage.load('game:daily', null);
  if (isUsableGame(saved) && saved.puzzle === number) return restoreGame(saved, number);
  return newGame(dailyAnswer(number), number);
}

function loadUnlimitedGame() {
  const saved = storage.load('game:unlimited', null);
  return isUsableGame(saved) ? restoreGame(saved, null) : dealUnlimitedGame();
}

/** Picks a fresh unlimited word and saves it, so a reload keeps the same word. */
function dealUnlimitedGame() {
  const saved = storage.load('recent', []);
  const recent = Array.isArray(saved) ? saved : [];
  // Skip recently played words, and never spoil today's daily word.
  const answer = randomAnswer([...recent, dailyAnswer(puzzleNumber())]);
  storage.save('recent', [...recent, answer].slice(-RECENT_WORDS_KEPT));
  const game = newGame(answer);
  storage.save('game:unlimited', game);
  return game;
}

function saveGame(which) {
  const { puzzle, answer, guesses, hardMode, gaveUp } = games[which];
  storage.save(`game:${which}`, { puzzle, answer, guesses, hardMode, gaveUp });
}

function statusOf(game) {
  return game.gaveUp ? 'lost' : gameStatus(game.guesses, game.answer);
}

function recordResult(which) {
  const game = games[which];
  stats[which] = recordGame(stats[which], {
    won: statusOf(game) === 'won',
    guessCount: game.guesses.length,
    puzzle: game.puzzle,
  });
  storage.save(`stats:${which}`, stats[which]);
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

function render() {
  const game = games[mode];
  const playing = statusOf(game) === 'playing';
  board.render(game.guesses, game.answer, playing ? inputs[mode] : '');
  keyboard.update(letterStates(game.guesses, game.answer));
  modeSwitch.querySelector(`input[value="${mode}"]`).checked = true;
  $('puzzle-number').textContent = `#${games.daily.puzzle}`;
  newWordButton.hidden = mode !== 'unlimited';
  disarmGiveUp();
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

  if (guess.length < WORD_LENGTH) return rejectGuess(row, 'Not enough letters');
  if (!isValidWord(guess)) return rejectGuess(row, 'Not in word list');
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
  storage.save('mode', mode);
  clearToasts();
  refreshDailyPuzzle();
  render();
}

function startUnlimitedGame() {
  games.unlimited = dealUnlimitedGame();
  inputs.unlimited = '';
  statsDialog.close();
  clearToasts();
  if (mode !== 'unlimited') {
    mode = 'unlimited';
    storage.save('mode', mode);
  }
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
  const record = stats[mode];
  const status = statusOf(game);
  const over = status !== 'playing';

  $('stats-mode').textContent = mode === 'daily' ? 'Daily' : 'Unlimited';
  $('stat-played').textContent = record.played;
  $('stat-win').textContent = winPercentage(record);
  $('stat-streak').textContent = currentStreak(record, mode === 'daily' ? puzzleNumber() : null);
  $('stat-max').textContent = record.maxStreak;
  renderDistribution(record, status === 'won' ? game.guesses.length : null);

  $('result').hidden = !over;
  if (over) renderResult(game, status);

  $('countdown').hidden = mode !== 'daily';
  $('share-button').hidden = !over;
  const playButton = $('play-button');
  playButton.textContent = mode === 'daily' ? 'Play Unlimited' : 'New word';
  playButton.hidden = mode === 'unlimited' && !over;
}

function renderDistribution(record, highlight) {
  const most = Math.max(...record.distribution);
  const items = record.distribution.map((count, i) => {
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
  $('distribution').hidden = record.played === 0;
  $('distribution-empty').hidden = record.played > 0;
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
    showToast('Hard mode can only be turned on at the start of a round', { duration: 2400 });
    return;
  }
  settings.hardMode = hardModeInput.checked;
  saveSettings();
  // Turning hard mode off mid-round relaxes the current round too.
  if (!settings.hardMode && midRound && game.hardMode) {
    game.hardMode = false;
    saveGame(mode);
  }
}

// ---------- Keyboard and lifecycle ----------

function onKeyDown(event) {
  if (event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
  if (isAnyDialogOpen()) return;
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
  } else if (key === 'stats:daily' || key === 'stats:unlimited') {
    const which = key.slice('stats:'.length);
    stats[which] = normalizeStats(storage.load(key, null));
    if (statsDialog.isOpen) renderStats();
  } else if (key === 'game:daily' || key === 'game:unlimited') {
    const which = key.slice('game:'.length);
    const saved = storage.load(key, null);
    if (!isUsableGame(saved)) return;
    if (which === 'daily' && saved.puzzle !== games.daily.puzzle) return;
    games[which] = restoreGame(saved, saved.puzzle ?? null);
    inputs[which] = '';
    if (mode === which) render();
    if (statsDialog.isOpen) renderStats();
  }
}

function initialMode() {
  // A fresh daily puzzle comes first; otherwise resume the last mode played.
  const dailyUntouched = statusOf(games.daily) === 'playing' && games.daily.guesses.length === 0;
  return !dailyUntouched && storage.load('mode', 'daily') === 'unlimited' ? 'unlimited' : 'daily';
}

export function start() {
  applyTheme();
  syncSettingsInputs();
  mode = initialMode();
  render();

  document.addEventListener('keydown', onKeyDown);
  modeSwitch.addEventListener('change', (event) => switchMode(event.target.value));
  newWordButton.addEventListener('click', onNewWordClick);
  $('help-button').addEventListener('click', () => helpDialog.open());
  $('stats-button').addEventListener('click', openStats);
  $('settings-button').addEventListener('click', () => {
    syncSettingsInputs();
    settingsDialog.open();
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
    settings.highContrast = highContrastInput.checked;
    saveSettings();
    applyTheme();
  });
  systemDarkTheme.addEventListener('change', () => {
    if (settings.darkTheme !== null) return;
    applyTheme();
    syncSettingsInputs();
  });
  storage.onExternalChange(onStorageChange);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) refreshDailyPuzzle();
  });
  window.addEventListener('focus', refreshDailyPuzzle);
  scheduleMidnightRefresh();

  if (!storage.load('seen-help', false)) {
    storage.save('seen-help', true);
    helpDialog.open();
  } else if (mode === 'daily' && statusOf(games.daily) !== 'playing') {
    openStats();
  }
}
