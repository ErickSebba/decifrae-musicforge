import { noteToMidi } from "./note-utils";

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

/**
 * Converte nome da nota + oitava em frequência (Hz) pelo temperamento igual de 12 tons,
 * com A4 = 440 Hz. Enarmônicos resolvem para a mesma frequência (ex.: "F#" e "Gb").
 * Pura — sem dependência de Web Audio, fácil de testar. Reusa o cálculo de notas de note-utils.
 */
export function noteToFrequency(noteName: string, octave: number): number {
  const midi = noteToMidi(`${noteName}${octave}`);
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

/** Relógio do AudioContext (segundos), fonte de verdade para timing do modo Tap. */
export function audioContextTime(): number {
  return getContext().currentTime;
}

/**
 * Clique curto do metrônomo, agendável. `atTimeSec` é um tempo absoluto do AudioContext
 * (default = agora). Retorna o oscilador para permitir cancelamento (ex.: ao parar).
 */
export function playClick(atTimeSec?: number): OscillatorNode {
  const ctx = getContext();
  const t = atTimeSec ?? ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "square";
  osc.frequency.setValueAtTime(1500, t);

  // Envelope curtíssimo (clique), sem estalo.
  gain.gain.setValueAtTime(0.0001, t);
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(t);
  osc.stop(t + 0.06);
  return osc;
}