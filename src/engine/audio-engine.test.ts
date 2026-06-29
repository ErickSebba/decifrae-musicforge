import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  audioContextTime,
  noteToFrequency,
  playClick,
  playNote,
  playNoteByName,
  resetAudioContext,
} from "./audio-engine";

// --- Mock mínimo da Web Audio API (jsdom não a implementa) ---

class MockParam {
  value = 0;
  setValueAtTime = vi.fn((v: number) => {
    this.value = v;
  });
  exponentialRampToValueAtTime = vi.fn();
}

class MockOscillator {
  type = "";
  frequency = new MockParam();
  connect = vi.fn();
  start = vi.fn();
  stop = vi.fn();
}

class MockGain {
  gain = new MockParam();
  connect = vi.fn();
}

// Osciladores e contextos criados na execução atual, para inspeção nos asserts.
const createdOscillators: MockOscillator[] = [];
const createdContexts: MockAudioContext[] = [];

class MockAudioContext {
  state: "suspended" | "running" = "suspended";
  currentTime = 0;
  destination = {};
  constructor() {
    createdContexts.push(this);
  }
  resume = vi.fn(() => {
    this.state = "running";
    return Promise.resolve();
  });
  close = vi.fn(() => Promise.resolve());
  createOscillator = vi.fn(() => {
    const osc = new MockOscillator();
    createdOscillators.push(osc);
    return osc;
  });
  createGain = vi.fn(() => new MockGain());
}

beforeEach(() => {
  resetAudioContext();
  createdOscillators.length = 0;
  createdContexts.length = 0;
  vi.stubGlobal("AudioContext", MockAudioContext as unknown as typeof AudioContext);
});

afterEach(() => {
  resetAudioContext();
  vi.unstubAllGlobals();
});

describe("noteToFrequency", () => {
  it("resolve A4 para 440 Hz", () => {
    expect(noteToFrequency("A", 4)).toBeCloseTo(440, 5);
  });

  it("resolve as cordas soltas do baixo", () => {
    expect(noteToFrequency("E", 1)).toBeCloseTo(41.2, 1);
    expect(noteToFrequency("A", 1)).toBeCloseTo(55, 1);
    expect(noteToFrequency("D", 2)).toBeCloseTo(73.42, 1);
    expect(noteToFrequency("G", 2)).toBeCloseTo(98, 1);
  });

  it("trata sustenidos e bemóis enarmônicos como a mesma frequência", () => {
    expect(noteToFrequency("F#", 2)).toBeCloseTo(noteToFrequency("Gb", 2), 5);
    expect(noteToFrequency("C#", 4)).toBeCloseTo(noteToFrequency("Db", 4), 5);
    expect(noteToFrequency("A#", 3)).toBeCloseTo(noteToFrequency("Bb", 3), 5);
  });

  it("lança erro para nota inválida", () => {
    expect(() => noteToFrequency("H", 4)).toThrow();
  });
});

describe("playNote", () => {
  it("cria um oscilador senoidal na frequência dada", () => {
    playNote(440);
    expect(createdOscillators).toHaveLength(1);
    const osc = createdOscillators[0];
    expect(osc.type).toBe("sine");
    expect(osc.frequency.value).toBe(440);
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });
});

describe("playNoteByName", () => {
  it("'A'/4 toca um oscilador a 440 Hz", () => {
    playNoteByName("A", 4);
    expect(createdOscillators).toHaveLength(1);
    expect(createdOscillators[0].frequency.value).toBeCloseTo(440, 5);
  });
});

describe("AudioContext suspenso", () => {
  it("é resumido no primeiro uso (restrição de gesto do usuário)", () => {
    playNote(440);
    expect(createdContexts).toHaveLength(1);
    expect(createdContexts[0].resume).toHaveBeenCalled();
  });
});

describe("playClick", () => {
  it("cria um oscilador de clique curto", () => {
    const osc = playClick();
    expect(createdOscillators).toHaveLength(1);
    expect(osc.type).toBe("square");
    expect(osc.start).toHaveBeenCalled();
    expect(osc.stop).toHaveBeenCalled();
  });
});

describe("audioContextTime", () => {
  it("retorna o currentTime do contexto", () => {
    expect(audioContextTime()).toBe(0); // mock: currentTime = 0
  });
});