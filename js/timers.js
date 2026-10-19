import { escapeHTML, fmtClock } from './format.js';

// Running timers survive step changes, leaving cook mode and reloads: each one
// stores the wall-clock time it ends, not a countdown.
const KEY = 'mise.timers.v1';

let timers = load();
let tray = null;
let onOpen = null;
let audio = null;
let tickHandle = null;

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) || [];
  } catch {
    return [];
  }
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(timers));
  } catch {
    // ignore
  }
}

/** Remaining seconds until the minimum time; negative once it has passed. */
function remaining(t, now = Date.now()) {
  if (t.pausedRemaining != null) return t.pausedRemaining;
  return (t.endAt - now) / 1000;
}

// iOS only plays Web Audio after a user gesture, so the context is created on
// the tap that starts a timer.
function unlockAudio() {
  if (audio) {
    if (audio.state === 'suspended') audio.resume();
    return;
  }
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (Ctx) audio = new Ctx();
}

function chime() {
  if (audio) {
    const t0 = audio.currentTime;
    for (let i = 0; i < 3; i++) {
      for (const [offset, freq] of [[0, 880], [0.18, 1175]]) {
        const osc = audio.createOscillator();
        const gain = audio.createGain();
        const start = t0 + i * 0.7 + offset;
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.4, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.35);
        osc.connect(gain).connect(audio.destination);
        osc.start(start);
        osc.stop(start + 0.4);
      }
    }
  }
  navigator.vibrate?.([300, 150, 300, 150, 300]);
}

export function startTimer({ recipeId, recipeTitle, stepNumber, label, minSeconds, maxSeconds }) {
  unlockAudio();
  const existing = timers.find(
    (t) => t.recipeId === recipeId && t.stepNumber === stepNumber && t.label === label,
  );
  if (existing) return existing;
  const t = {
    id: Math.random().toString(36).slice(2, 9),
    recipeId,
    recipeTitle,
    stepNumber,
    label,
    minSeconds,
    maxSeconds: Math.max(maxSeconds || minSeconds, minSeconds),
    endAt: Date.now() + minSeconds * 1000,
    pausedRemaining: null,
    alerted: false,
  };
  timers.push(t);
  save();
  render();
  ensureTicking();
  return t;
}

export function isRunning(recipeId, stepNumber, label) {
  return timers.some((t) => t.recipeId === recipeId && t.stepNumber === stepNumber && t.label === label);
}

function togglePause(id) {
  const t = timers.find((x) => x.id === id);
  if (!t) return;
  unlockAudio();
  if (t.pausedRemaining != null) {
    t.endAt = Date.now() + t.pausedRemaining * 1000;
    t.pausedRemaining = null;
  } else if (remaining(t) > 0) {
    t.pausedRemaining = remaining(t);
  }
  save();
  render();
}

function dismiss(id) {
  timers = timers.filter((x) => x.id !== id);
  save();
  render();
  document.dispatchEvent(new CustomEvent('mise:timers'));
}

function tick() {
  const now = Date.now();
  let changed = false;
  for (const t of timers) {
    if (!t.alerted && t.pausedRemaining == null && remaining(t, now) <= 0) {
      t.alerted = true;
      changed = true;
      chime();
    }
  }
  if (changed) save();
  render();
  if (!timers.length) {
    clearInterval(tickHandle);
    tickHandle = null;
  }
}

function ensureTicking() {
  if (!tickHandle && timers.length) tickHandle = setInterval(tick, 500);
}

function render() {
  if (!tray) return;
  if (!timers.length) {
    tray.innerHTML = '';
    tray.hidden = true;
    return;
  }
  tray.hidden = false;
  const now = Date.now();
  tray.innerHTML = timers.map((t) => {
    const r = remaining(t, now);
    const paused = t.pausedRemaining != null;
    const done = r <= 0;
    const extra = t.maxSeconds - t.minSeconds;
    let sub = `Step ${t.stepNumber} · ${escapeHTML(t.recipeTitle)}`;
    let clock = fmtClock(r);
    if (done) {
      const over = -r;
      clock = `+${fmtClock(over)}`;
      sub = extra > 0 && over < extra
        ? `Check it · up to ${fmtClock(extra - over)} more`
        : `Done · Step ${t.stepNumber}`;
    } else if (paused) {
      sub = `Paused · ${sub}`;
    }
    return `
      <div class="timer ${done ? 'is-done' : ''} ${paused ? 'is-paused' : ''}">
        <button class="timer-main" data-timer-open="${t.id}" aria-label="Go to step ${t.stepNumber}">
          <span class="timer-clock">${clock}</span>
          <span class="timer-label">${escapeHTML(t.label)}</span>
          <span class="timer-sub">${sub}</span>
        </button>
        ${done ? '' : `<button class="timer-btn" data-timer-pause="${t.id}" aria-label="${paused ? 'Resume' : 'Pause'}">${paused ? icon('play') : icon('pause')}</button>`}
        <button class="timer-btn" data-timer-dismiss="${t.id}" aria-label="Dismiss timer">${icon('x')}</button>
      </div>`;
  }).join('');
}

function icon(name) {
  const paths = {
    play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
  };
  return `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">${paths[name]}</svg>`;
}

export function mountTimers(el, open) {
  tray = el;
  onOpen = open;
  tray.addEventListener('click', (e) => {
    const p = e.target.closest('[data-timer-pause]');
    const d = e.target.closest('[data-timer-dismiss]');
    const o = e.target.closest('[data-timer-open]');
    if (p) togglePause(p.dataset.timerPause);
    else if (d) dismiss(d.dataset.timerDismiss);
    else if (o) {
      const t = timers.find((x) => x.id === o.dataset.timerOpen);
      if (t) onOpen?.(t);
    }
  });
  render();
  ensureTicking();
}
