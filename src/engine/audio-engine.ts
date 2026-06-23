let _ctx: AudioContext | null = null;

function getContext(): AudioContext {
  if (!_ctx) _ctx = new AudioContext();
  return _ctx;
}

export function playNote(frequencyHz: number, durationSec = 0.5): void {
  const ctx = getContext();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = "sine";
  osc.frequency.setValueAtTime(frequencyHz, ctx.currentTime);
  gain.gain.setValueAtTime(0.3, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationSec);

  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(ctx.currentTime);
  osc.stop(ctx.currentTime + durationSec);
}
