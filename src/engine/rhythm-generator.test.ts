import { describe, it, expect } from "vitest";
import {
  FIGURES,
  generateBar,
  generateLevelPass,
  type FigureId,
  type Rng,
} from "./rhythm-generator";
import { CURATED_LEVELS } from "./levels";
import { beatsPerBar, splitIntoBars, type RhythmEvent } from "./rhythm-engine";

/** PRNG determinístico (mulberry32) — fuzz reprodutível, sem aleatoriedade real. */
function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** O evento corresponde a alguma figura do vocabulário? */
function matchesVocabulary(ev: RhythmEvent, vocabulary: FigureId[]): boolean {
  return vocabulary.some(
    (id) => FIGURES[id].beats === ev.beats && Boolean(FIGURES[id].rest) === Boolean(ev.rest)
  );
}

describe("generateLevelPass — fuzz sobre os 6 perfis (100 seeds cada)", () => {
  it.each(CURATED_LEVELS.map((lv) => [lv.name, lv] as const))(
    "'%s': toda passada gerada é válida",
    (_name, level) => {
      for (let seed = 1; seed <= 100; seed++) {
        const pass = generateLevelPass(level, mulberry32(seed));

        // Compassos fecham exatos na fórmula (splitIntoBars lança se não).
        const bars = splitIntoBars(pass, level.timeSignature);
        expect(bars).toHaveLength(level.structure.bars);

        for (const ev of pass) {
          expect(matchesVocabulary(ev, level.vocabulary)).toBe(true);
        }

        // R1: nenhum compasso 100% pausa.
        for (const bar of bars) {
          expect(bar.some((ev) => !ev.rest)).toBe(true);
        }

        // R2: com vocabulário >=2, compassos consecutivos não são idênticos.
        if (level.vocabulary.length >= 2) {
          for (let i = 1; i < bars.length; i++) {
            expect(JSON.stringify(bars[i])).not.toBe(JSON.stringify(bars[i - 1]));
          }
        }
      }
    }
  );

  it("mesma seed → passada idêntica (determinismo)", () => {
    const level = CURATED_LEVELS[1];
    expect(generateLevelPass(level, mulberry32(42))).toEqual(
      generateLevelPass(level, mulberry32(42))
    );
  });

  it("seeds diferentes produzem passadas diferentes (quando há variedade)", () => {
    const level = CURATED_LEVELS[1]; // semínimas+mínimas: espaço combinatório real
    const passes = [1, 2, 3, 4, 5].map((s) => JSON.stringify(generateLevelPass(level, mulberry32(s))));
    expect(new Set(passes).size).toBeGreaterThan(1);
  });

  it("perfil só de semínimas: sempre a passada toda de semínimas (R2 isenta)", () => {
    const l1 = CURATED_LEVELS[0];
    const pass = generateLevelPass(l1, mulberry32(7));
    expect(pass.every((ev) => ev.beats === 1 && !ev.rest)).toBe(true);
    expect(pass).toHaveLength(l1.structure.bars * beatsPerBar(l1.timeSignature));
  });

  it("perfil 3/4: compassos somam exatamente 3 batidas", () => {
    const l6 = CURATED_LEVELS[5];
    for (let seed = 1; seed <= 50; seed++) {
      const bars = splitIntoBars(generateLevelPass(l6, mulberry32(seed)), l6.timeSignature);
      for (const bar of bars) {
        expect(bar.reduce((sum, ev) => sum + ev.beats, 0)).toBe(3);
      }
    }
  });
});

describe("generateBar — regras e blindagens", () => {
  const TS_3_4 = { count: 3, unit: 4 };
  const TS_4_4 = { count: 4, unit: 4 };

  it("figura que nunca cabe (semibreve em 3/4) simplesmente não aparece", () => {
    for (let seed = 1; seed <= 50; seed++) {
      const bar = generateBar(["semibreve", "seminima"], TS_3_4, mulberry32(seed));
      expect(bar.every((ev) => ev.beats !== 4)).toBe(true);
    }
  });

  it("lança erro claro (em vez de travar) quando o vocabulário não fecha a fórmula", () => {
    // Mínima (2) em 3/4: sobra sempre 1 batida que nada cobre — beco sem saída garantido.
    expect(() => generateBar(["minima"], TS_3_4, mulberry32(1))).toThrow(
      /não foi possível fechar/i
    );
  });

  it("lança também quando NENHUMA figura cabe desde o início", () => {
    expect(() => generateBar(["semibreve"], TS_3_4, mulberry32(1))).toThrow(
      /não foi possível fechar/i
    );
  });

  it("lança quando o vocabulário não tem figura de nota", () => {
    expect(() => generateBar(["pausa-seminima"], TS_4_4, mulberry32(1))).toThrow(
      /sem figura de nota/i
    );
  });

  it("R1 com RNG viciado em pausas: fallback só-notas fecha o compasso", () => {
    // rng ~1 sempre escolhe a última figura da lista (a pausa) → todo sorteio dá compasso
    // 100% pausa → o fallback preenche só com notas.
    const biased: Rng = () => 0.999999;
    const bar = generateBar(["seminima", "pausa-seminima"], TS_4_4, biased);
    expect(bar.reduce((sum, ev) => sum + ev.beats, 0)).toBe(4);
    expect(bar.some((ev) => !ev.rest)).toBe(true);
  });

  it("R2: com vocabulário variado, não repete o compasso anterior", () => {
    const previous: RhythmEvent[] = [{ beats: 1 }, { beats: 1 }, { beats: 1 }, { beats: 1 }];
    for (let seed = 1; seed <= 50; seed++) {
      const bar = generateBar(["seminima", "minima"], TS_4_4, mulberry32(seed), previous);
      expect(JSON.stringify(bar)).not.toBe(JSON.stringify(previous));
    }
  });
});