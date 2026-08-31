// Tiny, tasteful sound design. Everything synthesized — no assets, no copyright.
// Muted state persists; audio context starts lazily on first user gesture.

let ctx: AudioContext | null = null
// silent by default — sound is opt-in via the topbar toggle
let muted = true
try {
  muted = localStorage.getItem('duet-sound') !== 'on'
} catch {
  /* storage unavailable */
}

export function soundMuted() {
  return muted
}

export function setSoundMuted(m: boolean) {
  muted = m
  try {
    localStorage.setItem('duet-sound', m ? 'off' : 'on')
  } catch {
    /* ignore */
  }
}

function ac(): AudioContext | null {
  if (muted) return null
  try {
    if (!ctx) ctx = new AudioContext()
    if (ctx.state === 'suspended') ctx.resume()
    return ctx
  } catch {
    return null
  }
}

function tone(freq: number, start: number, dur: number, peak: number, type: OscillatorType = 'sine') {
  const c = ac()
  if (!c) return
  const t0 = c.currentTime + start
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.015)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.05)
}

export const sound = {
  /** soft two-note chime — a plan clicked into place */
  success() {
    tone(659.25, 0, 0.28, 0.07) // E5
    tone(880, 0.09, 0.4, 0.06) // A5
  },
  /** low felt thud — a conflict just appeared */
  conflict() {
    tone(98, 0, 0.22, 0.12, 'triangle') // G2
    tone(196, 0.02, 0.12, 0.045, 'sine')
  },
  /** tiny wooden tick — pin toggled / small confirm */
  tick() {
    tone(1318.5, 0, 0.07, 0.04, 'triangle')
  },
}
