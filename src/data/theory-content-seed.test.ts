import { describe, it, expect } from "vitest";
import {
  THEORY_CONTENT,
  THEORY_SECTION_LABELS,
  THEORY_SECTION_ORDER,
  sectionsToBody,
  type TheoryTopicId,
} from "./theory-content-seed";

const ALL_TOPICS: TheoryTopicId[] = [
  "major",
  "naturalMinor",
  "ionian",
  "dorian",
  "phrygian",
  "lydian",
  "mixolydian",
  "aeolian",
  "locrian",
  "majorPentatonic",
  "minorPentatonic",
  "blues",
];

describe("THEORY_CONTENT — conteúdo dos 12 tipos", () => {
  it("tem exatamente os 12 topics do seletor", () => {
    expect(Object.keys(THEORY_CONTENT).sort()).toEqual([...ALL_TOPICS].sort());
  });

  it("todas as seções obrigatórias estão preenchidas em todos os tipos", () => {
    for (const topic of ALL_TOPICS) {
      const { title, sections } = THEORY_CONTENT[topic];
      expect(title, topic).not.toBe("");
      for (const key of ["formula", "whatItIs", "character", "context", "comparison", "bassApplication"] as const) {
        expect(sections[key], `${topic}.${key}`).toBeTruthy();
      }
    }
  });

  it("fórmulas intervalares batem com o arquivo fonte (spot-check)", () => {
    expect(THEORY_CONTENT.major.sections.formula).toBe("1 - 2 - 3 - 4 - 5 - 6 - 7");
    expect(THEORY_CONTENT.naturalMinor.sections.formula).toBe("1 - 2 - b3 - 4 - 5 - b6 - b7");
    expect(THEORY_CONTENT.locrian.sections.formula).toBe("1 - b2 - b3 - 4 - b5 - b6 - b7");
    expect(THEORY_CONTENT.blues.sections.formula).toBe("1 - b3 - 4 - #4 - 5 - b7");
  });

  it("só a escala maior tem a curiosidade opcional (estado atual da fonte)", () => {
    expect(THEORY_CONTENT.major.sections.curiosity).toBeTruthy();
    for (const topic of ALL_TOPICS.filter((t) => t !== "major")) {
      expect(THEORY_CONTENT[topic].sections.curiosity, topic).toBeUndefined();
    }
  });
});

describe("sectionsToBody", () => {
  it("serializa todas as seções presentes com rótulo, na ordem canônica", () => {
    const body = sectionsToBody(THEORY_CONTENT.major.sections);
    let lastIndex = -1;
    for (const key of THEORY_SECTION_ORDER) {
      const label = `**${THEORY_SECTION_LABELS[key]}:**`;
      const idx = body.indexOf(label);
      expect(idx, label).toBeGreaterThan(lastIndex);
      lastIndex = idx;
    }
  });

  it("omite a curiosidade quando ausente", () => {
    const body = sectionsToBody(THEORY_CONTENT.dorian.sections);
    expect(body).not.toContain(THEORY_SECTION_LABELS.curiosity);
    expect(body).toContain("**Fórmula intervalar:**\n1 - 2 - b3 - 4 - 5 - 6 - b7");
  });
});
