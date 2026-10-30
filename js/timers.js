import { escapeHTML, fmtClock } from './format.js';

// Running timers survive step changes, leaving cook mode and reloads: each one
// stores the wall-clock time it ends, not a countdown.
const KEY = 'mise.timers.v1';

let timers = load();
let tray = null;
let onOpen = null;
let audio = null;
let tickHandle = null;

// When a timer finishes, the chime repeats and the screen flashes for a minute,
// or until the timer is stopped, opened or dismissed.
const ALARM_MS = 60 * 1000;
const CHIME_EVERY_MS = 3000;
// A chime takes about 2 seconds, so none starts this close to the alarm's end.
const CHIME_CUTOFF_MS = 2500;
let lastChimeAt = 0;

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
  if (audio?.state === 'suspended') audio.resume();
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

export function outro(ctx = audio) {
  if (!ctx) return;
  if (ctx.state === 'suspended') ctx.resume();
  const t0 = ctx.currentTime + 0.05;
  const dur = 1.5;

  const tone = ctx.createOscillator();
  tone.type = 'sawtooth';
  tone.frequency.setValueAtTime(115, t0);
  tone.frequency.exponentialRampToValueAtTime(62, t0 + dur);

  const wobble = ctx.createOscillator();
  const wobbleDepth = ctx.createGain();
  wobble.frequency.value = 23;
  wobbleDepth.gain.value = 28;
  wobble.connect(wobbleDepth).connect(tone.frequency);

  const flutter = ctx.createOscillator();
  const flutterDepth = ctx.createGain();
  const amp = ctx.createGain();
  flutter.type = 'square';
  flutter.frequency.setValueAtTime(19, t0);
  flutter.frequency.linearRampToValueAtTime(8, t0 + dur);
  flutterDepth.gain.value = 0.3;
  amp.gain.value = 0.55;
  flutter.connect(flutterDepth).connect(amp.gain);

  const noise = ctx.createBufferSource();
  const buf = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * dur), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  noise.buffer = buf;
  const noiseBand = ctx.createBiquadFilter();
  const noiseLevel = ctx.createGain();
  noiseBand.type = 'bandpass';
  noiseBand.frequency.value = 180;
  noiseBand.Q.value = 1.5;
  noiseLevel.gain.value = 0.35;
  noise.connect(noiseBand).connect(noiseLevel).connect(amp);

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.setValueAtTime(520, t0);
  lowpass.frequency.exponentialRampToValueAtTime(260, t0 + dur);
  lowpass.Q.value = 7;

  const env = ctx.createGain();
  env.gain.setValueAtTime(0.0001, t0);
  env.gain.exponentialRampToValueAtTime(0.6, t0 + 0.04);
  env.gain.setValueAtTime(0.6, t0 + dur * 0.55);
  env.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  tone.connect(lowpass).connect(amp).connect(env).connect(ctx.destination);
  for (const node of [tone, wobble, flutter, noise]) {
    node.start(t0);
    node.stop(t0 + dur + 0.05);
  }
}

export function startTimer({ recipeId, recipeTitle, stepNumber, label, minSeconds, maxSeconds }) {
  unlockAudio();
  const existing = recipeId && timers.find(
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
    total: minSeconds,
    pausedRemaining: null,
    alerted: false,
  };
  timers.push(t);
  save();
  render();
  ensureTicking();
  return t;
}

// A kitchen timer that isn't tied to a recipe step. Each tap starts another one.
export function startQuickTimer(seconds = 300) {
  const n = timers.filter((t) => !t.recipeId).length;
  return startTimer({
    recipeId: null,
    recipeTitle: '',
    stepNumber: null,
    label: n ? `Timer ${n + 1}` : 'Timer',
    minSeconds: seconds,
  });
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

// Adds time. On a finished timer it starts counting down again from the added
// time and clears the alarm, so it can ring again.
function adjust(id, seconds) {
  const t = timers.find((x) => x.id === id);
  if (!t) return;
  unlockAudio();
  const now = Date.now();
  if (t.pausedRemaining != null) {
    t.pausedRemaining += seconds;
    t.total = (t.total || t.minSeconds) + seconds;
  } else if (remaining(t, now) <= 0) {
    t.endAt = now + seconds * 1000;
    t.total = seconds;
    t.maxSeconds = t.minSeconds;
    t.alerted = false;
    t.alarmUntil = 0;
    t.rangOut = false;
  } else {
    t.endAt += seconds * 1000;
    t.total = (t.total || t.minSeconds) + seconds;
  }
  save();
  render();
}

function isRinging(t, now = Date.now()) {
  return (t.alarmUntil || 0) > now;
}

function silence(id) {
  const t = timers.find((x) => x.id === id);
  if (!t) return;
  t.alarmUntil = 0;
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
      t.alarmUntil = now + ALARM_MS;
      changed = true;
    }
  }
  for (const t of timers) {
    if (t.alarmUntil && !t.rangOut && now >= t.alarmUntil) {
      t.rangOut = true;
      changed = true;
      if (now - t.alarmUntil < 30000) outro();
    }
  }
  if (changed) save();

  const ringing = timers.some((t) => isRinging(t, now));
  const chimeFits = timers.some((t) => t.alarmUntil - now > CHIME_CUTOFF_MS);
  if (ringing && chimeFits && now - lastChimeAt >= CHIME_EVERY_MS) {
    lastChimeAt = now;
    chime();
  }
  document.body.classList.toggle('is-alarming', ringing);
  render();
  if (!timers.length) {
    clearInterval(tickHandle);
    tickHandle = null;
    document.body.classList.remove('is-alarming');
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
    const left = done ? 0 : Math.min(1, r / (t.total || t.minSeconds));
    const clock = done ? `+${fmtClock(-r)}` : fmtClock(r);
    const name = t.recipeId ? `Go to step ${t.stepNumber}, ${t.label}` : t.label;
    return `
      <div class="timer ${done ? 'is-done' : ''} ${paused ? 'is-paused' : ''} ${isRinging(t, now) ? 'is-ringing' : ''}">
        <button class="timer-main" data-timer-open="${t.id}" aria-label="${escapeHTML(name)}">
          <span class="timer-clock">${clock}</span>
        </button>
        ${isRinging(t, now) ? `<button class="timer-stop" data-timer-silence="${t.id}">${icon('bellOff')}Stop</button>` : ''}
        <button class="timer-btn timer-adj" data-timer-adjust="60" data-timer-id="${t.id}" aria-label="Add a minute">+1</button>
        <button class="timer-btn timer-adj" data-timer-adjust="300" data-timer-id="${t.id}" aria-label="Add five minutes">+5</button>
        ${done ? '' : `<button class="timer-btn" data-timer-pause="${t.id}" aria-label="${paused ? 'Resume' : 'Pause'}">${paused ? icon('play') : icon('pause')}</button>`}
        <button class="timer-btn" data-timer-dismiss="${t.id}" aria-label="Dismiss timer">${icon('x')}</button>
        ${done ? '' : `<span class="timer-left" style="width: ${(left * 100).toFixed(2)}%" aria-hidden="true"></span>`}
      </div>`;
  }).join('');
}

function icon(name) {
  const paths = {
    play: '<path d="M8 5v14l11-7z" fill="currentColor" stroke="none"/>',
    pause: '<path d="M8 5h3v14H8zM13 5h3v14h-3z" fill="currentColor" stroke="none"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    bellOff: '<path d="M9.5 19a2.5 2.5 0 0 0 5 0M6 16h12l-1.5-2V10a4.5 4.5 0 0 0-7.6-3.3M7.5 10v4L6 16M4 4l16 16"/>',
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
    const m = e.target.closest('[data-timer-silence]');
    const a = e.target.closest('[data-timer-adjust]');
    if (a) adjust(a.dataset.timerId, Number(a.dataset.timerAdjust));
    else if (m) silence(m.dataset.timerSilence);
    else if (p) togglePause(p.dataset.timerPause);
    else if (d) dismiss(d.dataset.timerDismiss);
    else if (o) {
      const t = timers.find((x) => x.id === o.dataset.timerOpen);
      if (t) {
        if (isRinging(t)) silence(t.id);
        if (t.recipeId) onOpen?.(t);
      }
    }
  });
  render();
  ensureTicking();
}
