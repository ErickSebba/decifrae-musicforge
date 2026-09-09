import { describe, expect, it } from "vitest";
import {
  deriveBookStatus,
  deriveChapterStatus,
  parseSyllabus,
  type StudyStatus,
} from "./study-track";

describe("deriveChapterStatus", () => {
  it("sem exercícios usa o own_status (ou nao_iniciado se null)", () => {
    expect(deriveChapterStatus(null, [])).toBe("nao_iniciado");
    expect(deriveChapterStatus("em_andamento", [])).toBe("em_andamento");
    expect(deriveChapterStatus("concluido", [])).toBe("concluido");
  });

  it("com exercícios IGNORA own_status e deriva", () => {
    const ex = (s: StudyStatus) => s;
    expect(deriveChapterStatus("concluido", [ex("nao_iniciado")])).toBe("nao_iniciado");
    expect(deriveChapterStatus(null, [ex("concluido"), ex("concluido")])).toBe("concluido");
    expect(deriveChapterStatus(null, [ex("nao_iniciado"), ex("nao_iniciado")])).toBe("nao_iniciado");
  });

  it("mistura (pelo menos um começou) → em_andamento", () => {
    expect(deriveChapterStatus(null, ["nao_iniciado", "concluido"])).toBe("em_andamento");
    expect(deriveChapterStatus(null, ["em_andamento", "nao_iniciado"])).toBe("em_andamento");
    expect(deriveChapterStatus(null, ["concluido", "em_andamento"])).toBe("em_andamento");
  });
});

describe("deriveBookStatus", () => {
  it("livro sem capítulos → nao_iniciado", () => {
    expect(deriveBookStatus([])).toBe("nao_iniciado");
  });
  it("rollup: todos concluído / todos não iniciado / misto", () => {
    expect(deriveBookStatus(["concluido", "concluido"])).toBe("concluido");
    expect(deriveBookStatus(["nao_iniciado", "nao_iniciado"])).toBe("nao_iniciado");
    expect(deriveBookStatus(["concluido", "nao_iniciado"])).toBe("em_andamento");
  });
});

describe("parseSyllabus", () => {
  it("PT: palavra-chave de capítulo + linhas numeradas/exercício", () => {
    const parsed = parseSyllabus(
      [
        "Capítulo 1 — Fundamentos",
        "    Postura e mão direita",
        "    Notas na corda E",
        "Capítulo 2 — Leitura rítmica",
        "Exercício 1: semínimas",
        "Exercício 2: colcheias",
      ].join("\n")
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0].title).toBe("Capítulo 1 — Fundamentos");
    // sub-itens INDENTADos sob o capítulo → exercícios (critério de indentação)
    expect(parsed[0].exercises.map((e) => e.label)).toEqual([
      "Postura e mão direita",
      "Notas na corda E",
    ]);
    // Exercício N é palavra-chave incondicional → exercício mesmo flush-left
    expect(parsed[1].title).toBe("Capítulo 2 — Leitura rítmica");
    expect(parsed[1].exercises).toHaveLength(2);
  });

  it("EN: chapter + bullets indentados", () => {
    const parsed = parseSyllabus(
      ["Chapter 1: Basics", "  - Exercise 1", "  - Exercise 2", "Chapter 2: Scales", "  - Exercise 1"].join(
        "\n"
      )
    );
    expect(parsed).toHaveLength(2);
    expect(parsed[0].exercises).toHaveLength(2);
    expect(parsed[1].exercises).toHaveLength(1);
  });

  it("lista pura de títulos (sem exercícios) → capítulos sem exercícios", () => {
    const parsed = parseSyllabus("Fundamentos\nRitmo\nEscalas");
    expect(parsed.map((c) => c.title)).toEqual(["Fundamentos", "Ritmo", "Escalas"]);
    expect(parsed.every((c) => c.exercises.length === 0)).toBe(true);
  });

  it("índice numerado no TOPO (sem palavra-chave) vira capítulos-irmãos, não um capítulo fake", () => {
    const parsed = parseSyllabus("1. Introdução\n2. Primeiras notas\n3. Ritmo básico");
    expect(parsed.map((c) => c.title)).toEqual([
      "1. Introdução",
      "2. Primeiras notas",
      "3. Ritmo básico",
    ]);
    expect(parsed.every((c) => c.exercises.length === 0)).toBe(true);
  });

  it("CASO 5 — palavra-chave + numerados FLUSH-LEFT: numerados viram exercícios do capítulo", () => {
    const parsed = parseSyllabus("Capítulo 1 — Fundamentos\n1. Postura\n2. Afinação");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("Capítulo 1 — Fundamentos");
    expect(parsed[0].exercises.map((e) => e.label)).toEqual(["1. Postura", "2. Afinação"]);
  });

  it("CASO 6 — palavra-chave + linhas SIMPLES flush-left (sem marcador) viram capítulos-irmãos", () => {
    const parsed = parseSyllabus(
      "Capítulo 1 — Fundamentos\nPostura correta\nAfinação básica\nCapítulo 2 — Técnica"
    );
    // Regra 4 (linha simples) decide SÓ por indentação: flush-left → sempre irmão,
    // independente de o capítulo pai ter sido aberto por palavra-chave.
    expect(parsed.map((c) => c.title)).toEqual([
      "Capítulo 1 — Fundamentos",
      "Postura correta",
      "Afinação básica",
      "Capítulo 2 — Técnica",
    ]);
    expect(parsed.every((c) => c.exercises.length === 0)).toBe(true);
  });

  it("sub-itens INDENTADOS sob um capítulo (aberto por número) viram exercícios", () => {
    const parsed = parseSyllabus("1. Basic Technique\n    Left Hand\n    Right Hand");
    expect(parsed).toHaveLength(1);
    expect(parsed[0].title).toBe("1. Basic Technique");
    expect(parsed[0].exercises.map((e) => e.label)).toEqual(["Left Hand", "Right Hand"]);
  });

  it("índice numerado no topo SEGUIDO de capítulo por palavra-chave + exercício-keyword", () => {
    const parsed = parseSyllabus("1. Intro\n2. Ritmo\nCapítulo 3 — Escalas\nEx 1: dó maior");
    expect(parsed.map((c) => c.title)).toEqual(["1. Intro", "2. Ritmo", "Capítulo 3 — Escalas"]);
    expect(parsed[0].exercises).toHaveLength(0);
    expect(parsed[2].exercises.map((e) => e.label)).toEqual(["Ex 1: dó maior"]);
  });

  it("caso combinado: índice numerado no topo + uma linha indentada sem marcador", () => {
    const parsed = parseSyllabus("1. Introdução\n2. Primeiras notas\n   detalhe sem marcador aqui");
    expect(parsed.map((c) => c.title)).toEqual(["1. Introdução", "2. Primeiras notas"]);
    expect(parsed[0].exercises).toHaveLength(0);
    expect(parsed[1].exercises.map((e) => e.label)).toEqual(["detalhe sem marcador aqui"]);
  });

  it("CASO REAL Hal Leonard — TOC em bullets/indentação, sem palavra-chave de capítulo", () => {
    const parsed = parseSyllabus(
      [
        "Right-Hand Technique (10)",
        "    Fingerstyle (10)",
        "    Pick Style (11)",
        "Left-Hand Technique (11)",
        "    The 1-2-4 Fingering System (11)",
        "Open-String Exercises (12)",
      ].join("\n")
    );
    expect(parsed.map((c) => c.title)).toEqual([
      "Right-Hand Technique (10)",
      "Left-Hand Technique (11)",
      "Open-String Exercises (12)",
    ]);
    expect(parsed[0].exercises.map((e) => e.label)).toEqual(["Fingerstyle (10)", "Pick Style (11)"]);
    expect(parsed[1].exercises.map((e) => e.label)).toEqual(["The 1-2-4 Fingering System (11)"]);
    expect(parsed[2].exercises).toHaveLength(0);
  });

  it("CASO REAL Jaco Pastorius — capítulos numerados no topo + sub-itens indentados", () => {
    const parsed = parseSyllabus(
      [
        "1. Basic Technique (5)",
        "    Left Hand (5)",
        "    Right Hand (6)",
        "    The Sound (6)",
        "2. Basic Theory (7)",
        "3. Harmonic Elements (9)",
        "    Triads (10)",
        "    Diatonic Triads (13)",
      ].join("\n")
    );
    expect(parsed.map((c) => c.title)).toEqual([
      "1. Basic Technique (5)",
      "2. Basic Theory (7)",
      "3. Harmonic Elements (9)",
    ]);
    expect(parsed[0].exercises.map((e) => e.label)).toEqual([
      "Left Hand (5)",
      "Right Hand (6)",
      "The Sound (6)",
    ]);
    expect(parsed[1].exercises).toHaveLength(0);
    expect(parsed[2].exercises.map((e) => e.label)).toEqual(["Triads (10)", "Diatonic Triads (13)"]);
  });

  it("exercício (palavra-chave) ANTES de qualquer capítulo → capítulo implícito", () => {
    const parsed = parseSyllabus("Exercício 1: solto\nCapítulo 1 — Real\nExercício 2: real");
    expect(parsed[0].title).toBe("(sem capítulo)");
    expect(parsed[0].exercises).toHaveLength(1);
    expect(parsed[1].title).toBe("Capítulo 1 — Real");
  });

  it("vazio / só espaços → [] (nunca lança)", () => {
    expect(parseSyllabus("")).toEqual([]);
    expect(parseSyllabus("   \n\n  \t ")).toEqual([]);
  });

  it("prosa aleatória não lança e produz estrutura editável (não-destrutiva)", () => {
    const parsed = parseSyllabus("just some random text\nthat is not a syllabus at all");
    expect(parsed).toHaveLength(2); // cada linha vira capítulo
    expect(parsed.every((c) => c.exercises.length === 0)).toBe(true);
  });
});
