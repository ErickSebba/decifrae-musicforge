let _ctx: AudioContext | null = null;

/**
 * AudioContext singleton, reutilizado em toda a app. Criado preguiçosamente no primeiro
 * uso (que deve partir de um gesto do usuário — clique) e resumido se vier suspenso, já
 * que navegadores/WebView iniciam o contexto em `suspended` até a primeira interação.
 */
function getContext(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  if (_ctx.state === "suspended") void _ctx.resume();
  return _ctx;
}

/** Classes de altura (semitons a partir de C). Aceita naturais, sustenidos e bemóis. */
const PITCH_CLASS: Record<string, number> = {
  C: 0,
  "C#": 1,
  Db: 1,
  D: 2,
  "D#": 3,
  Eb: 3,
  E: 4,
  Fb: 4,
  "E#": 5,
  F: 5,
  "F#": 6,
  Gb: 6,
  G: 7,
  "G#": 8,
  Ab: 8,
  A: 9,
  "A#": 10,
  Bb: 10,
  B: 11,
  Cb: 11,
  "B#": 0,
};

/**
 * Converte nome da nota + oitava em frequência (Hz) pelo temperamento igual de 12 tons,
 * com A4 = 440 Hz. Enarmônicos resolvem para a mesma frequência (ex.: "F#" e "Gb").
 * Pura — sem dependência de Web Audio, fácil de testar.
 */
export function noteToFrequency(noteName: string, octave: number): number {
  // Normaliza: letra maiúscula + acidente (# ou b) em minúsculo (exceto o 'b' que mantemos).
  const letter = noteName.charAt(0).toUpperCase();
  const accidental = noteName.slice(1).replace("♯", "#").replace("♭", "b");
  const key = letter + accidental;

  const pitchClass = PITCH_CLASS[key];
  if (pitchClass === undefined) {
    throw new Error(`Nota inválida: "${noteName}"`);
  }

  // MIDI: A4 (octave 4, classe 9) = 69. f = 440 * 2^((midi - 69) / 12).
  const midi = 12 * (octave + 1) + pitchClass;
  return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Toca uma nota senoidal na frequência dada, por `durationSec`. Envelope com attack e
 * release curtos via GainNode para evitar o "click" de ligar/desligar o oscilador.
 */
export function playNote(frequencyHz: number, durationSec = 1.5): void {
  const ctx = getContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  const t0 = ctx.currentTime;
  const attack = 0.01;
  const peak = 0.3;
  const floor = 0.0001;

  osc.type = "sine";
  osc.frequency.setValueAtTime(frequencyHz, t0);

  // Envelope: floor -> peak (attack) -> floor (release). Exponential evita o estalo nas pontas.
  gain.gain.setValueAtTime(floor, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + attack);
  gain.gain.exponentialRampToValueAtTime(floor, t0 + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + durationSec);
}

/** Toca uma nota pelo nome + oitava (ex.: playNoteByName("E", 1) para a corda E1). */
export function playNoteByName(noteName: string, octave: number, durationSec?: number): void {
  playNote(noteToFrequency(noteName, octave), durationSec);
}

/** Fecha e zera o contexto singleton. Útil para teardown e isolamento de testes. */
export function resetAudioContext(): void {
  if (_ctx) {
    void _ctx.close?.();
    _ctx = null;
  }
}