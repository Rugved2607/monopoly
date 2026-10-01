/** Tiny WebAudio synth: no audio assets, fully optional, mutable. */
let ctx: AudioContext | null = null;
let muted = typeof localStorage !== 'undefined' && localStorage.getItem('ipt.muted') === '1';
const listeners = new Set<() => void>();

export const isMuted = () => muted;
export function setMuted(v: boolean) {
  muted = v;
  try {
    localStorage.setItem('ipt.muted', v ? '1' : '0');
  } catch {}
  listeners.forEach((l) => l());
}
export const subscribeMute = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function ac(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = 'sine', gain = 0.08, delay = 0, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.05, delay = 0, hp = 1200) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = hp;
  const g = a.createGain();
  g.gain.value = gain;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  dice() {
    for (let i = 0; i < 7; i++) noise(0.05, 0.05, i * 0.085, 1800 + (i % 3) * 600);
    tone(180, 0.12, 'triangle', 0.05, 0.62);
  },
  step() {
    tone(520 + Math.random() * 60, 0.05, 'triangle', 0.035);
  },
  buy() {
    tone(523, 0.12, 'sine', 0.09);
    tone(659, 0.12, 'sine', 0.09, 0.09);
    tone(784, 0.22, 'sine', 0.09, 0.18);
  },
  rent() {
    tone(880, 0.08, 'square', 0.04);
    tone(660, 0.14, 'square', 0.04, 0.07);
    tone(440, 0.2, 'square', 0.035, 0.15);
  },
  build() {
    noise(0.06, 0.09, 0, 300);
    noise(0.06, 0.09, 0.12, 300);
    tone(140, 0.12, 'sawtooth', 0.04, 0.02);
  },
  card() {
    noise(0.22, 0.05, 0, 2500);
    tone(660, 0.18, 'sine', 0.05, 0.12, 990);
  },
  bankrupt() {
    tone(330, 0.3, 'sawtooth', 0.06, 0, 110);
    tone(220, 0.5, 'sawtooth', 0.06, 0.25, 70);
  },
  victory() {
    [523, 659, 784, 1047, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.09, i * 0.14));
  },
  turn() {
    tone(740, 0.1, 'sine', 0.06);
    tone(988, 0.16, 'sine', 0.06, 0.1);
  },
  click() {
    tone(600, 0.04, 'sine', 0.04);
  },
};
