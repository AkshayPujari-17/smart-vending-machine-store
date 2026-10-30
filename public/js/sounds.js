/**
 * Web Audio sound effects.
 *
 * All sounds are synthesised at runtime (no audio files needed) and a global
 * mute toggle is persisted in localStorage.
 */
const STORAGE_KEY = 'smartVending.muted';

let ctx = null;
let muted = (() => {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
})();

function audio() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return null;
    ctx = new Ctor();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone({ freq, duration = 0.14, type = 'sine', gain = 0.12, delay = 0, glideTo = null }) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;

  const start = ac.currentTime + delay;
  const osc = ac.createOscillator();
  const amp = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);

  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.exponentialRampToValueAtTime(gain, start + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  osc.connect(amp).connect(ac.destination);
  osc.start(start);
  osc.stop(start + duration + 0.05);
}

function noise({ duration = 0.4, gain = 0.1, delay = 0, from = 1400, to = 300 }) {
  if (muted) return;
  const ac = audio();
  if (!ac) return;

  const start = ac.currentTime + delay;
  const frames = Math.max(1, Math.floor(ac.sampleRate * duration));
  const buffer = ac.createBuffer(1, frames, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

  const src = ac.createBufferSource();
  src.buffer = buffer;

  const filter = ac.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(from, start);
  filter.frequency.exponentialRampToValueAtTime(to, start + duration);

  const amp = ac.createGain();
  amp.gain.setValueAtTime(gain, start);
  amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);

  src.connect(filter).connect(amp).connect(ac.destination);
  src.start(start);
  src.stop(start + duration + 0.02);
}

export const sounds = {
  get muted() {
    return muted;
  },
  setMuted(value) {
    muted = Boolean(value);
    try {
      localStorage.setItem(STORAGE_KEY, muted ? '1' : '0');
    } catch {
      /* private mode */
    }
    if (!muted) audio(); // unlock audio on user gesture
  },
  toggle() {
    this.setMuted(!muted);
    return muted;
  },

  /** Metallic coin clink. */
  coin() {
    tone({ freq: 2093, duration: 0.09, type: 'triangle', gain: 0.14 });
    tone({ freq: 2637, duration: 0.13, type: 'sine', gain: 0.1, delay: 0.03 });
    tone({ freq: 1568, duration: 0.16, type: 'sine', gain: 0.07, delay: 0.06 });
  },

  /** Button press. */
  click() {
    tone({ freq: 880, duration: 0.05, type: 'square', gain: 0.05 });
    tone({ freq: 320, duration: 0.07, type: 'sine', gain: 0.06, delay: 0.02 });
  },

  /** Error buzz. */
  error() {
    tone({ freq: 220, duration: 0.16, type: 'square', gain: 0.07 });
    tone({ freq: 174, duration: 0.22, type: 'square', gain: 0.07, delay: 0.16 });
  },

  /** Purchase confirmed – short happy arpeggio. */
  success() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) =>
      tone({ freq: f, duration: 0.16, type: 'triangle', gain: 0.1, delay: i * 0.07 })
    );
  },

  /** Motor / dispensing sound. */
  dispensing() {
    noise({ duration: 0.85, gain: 0.08, from: 900, to: 220 });
    tone({ freq: 140, duration: 0.7, type: 'sawtooth', gain: 0.035, glideTo: 70 });
    tone({ freq: 90, duration: 0.18, type: 'sine', gain: 0.16, delay: 0.95, glideTo: 45 });
  },

  /** Refund – several coins dropping. */
  refund() {
    [0, 0.12, 0.24, 0.36].forEach((d) => tone({ freq: 2400 + Math.random() * 500, duration: 0.1, type: 'triangle', gain: 0.09, delay: d }));
    tone({ freq: 1760, duration: 0.22, type: 'sine', gain: 0.08, delay: 0.46 });
  },

  /** Flap opening. */
  flap() {
    noise({ duration: 0.22, gain: 0.06, from: 1800, to: 500 });
  },
};
