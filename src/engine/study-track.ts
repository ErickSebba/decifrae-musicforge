/**
 * Trilha de estudo externa (3.2) — lógica PURA: derivação de status e parser de
 * importação de sumário. Sem React/db/I-O (camada engine, tudo testável).
 *
 * MODELO (revertido na 3.2): o conteúdo (livros/capítulos/exercícios) vive no BANCO
 * (cadastro manual + importação), não mais fixo no código. Aqui só a lógica de derivação
 * e o parser; o CRUD é em src/db/study-track.ts.
 */

export type StudyStatus = "nao_iniciado" | "em_andamento" | "concluido";

/**
 * Status DERIVADO de um capítulo (mesmo ethos do deriveUnlockedLevels):
 * - sem exercícios cadastrados → usa o status próprio do capítulo (own_status), ou
 *   'nao_iniciado' se ele não tem nenhum (comum logo após importar só o sumário);
 * - com exercícios → todos concluído = 'concluido'; todos não iniciado = 'nao_iniciado';
 *   qualquer mistura (pelo menos um começou) = 'em_andamento'. O own_status é IGNORADO.
 */
export function deriveChapterStatus(
  ownStatus: StudyStatus | null,
  exerciseStatuses: StudyStatus[]
): StudyStatus {
  if (exerciseStatuses.length === 0) return ownStatus ?? "nao_iniciado";
  if (exerciseStatuses.every((s) => s === "concluido")) return "concluido";
  if (exerciseStatuses.every((s) => s === "nao_iniciado")) return "nao_iniciado";
  return "em_andamento";
}

/** Status DERIVADO de um livro: rollup sobre os status (já derivados) dos capítulos. */
export function deriveBookStatus(chapterStatuses: StudyStatus[]): StudyStatus {
  if (chapterStatuses.length === 0) return "nao_iniciado";
  if (chapterStatuses.every((s) => s === "concluido")) return "concluido";
  if (chapterStatuses.every((s) => s === "nao_iniciado")) return "nao_iniciado";
  return "em_andamento";
}

// ---------------------------------------------------------------------------
// Parser de importação de sumário (texto colado → estrutura editável)
// ---------------------------------------------------------------------------

export interface ParsedExercise {
  label: string;
}
export interface ParsedChapter {
  title: string;
  exercises: ParsedExercise[];
}

/** Palavra-chave de capítulo no início da linha (PT/EN) + número. */
export const CHAPTER_RE =
  /^(cap[íi]tulo|cap\.?|chapter|ch\.?|unidade|unit|li[çc][ãa]o|lesson|parte|part|se[çc][ãa]o|section)\b\s*\.?\s*\d+/i;
/** Palavra-chave de exercício no início da linha (PT/EN) + número. */
export const EXERCISE_RE = /^(exerc[íi]cio|exercise|ex\.?|estudo|study|n[ºo°.]|#)\s*\.?\s*\d+/i;
/** Marcador de item de lista: numerado (`1.` / `1)`) ou bullet. */
export const LIST_RE = /^(\d+[.)]|[-*•·–])\s+/;

const PLACEHOLDER_CHAPTER = "(sem capítulo)";

/** Nº de colunas de indentação (espaços à esquerda) da linha. */
function indentOf(rawLine: string): number {
  return rawLine.match(/^\s*/)?.[0].length ?? 0;
}

/**
 * Parseia um sumário colado em capítulos + exercícios. NUNCA lança; SEMPRE devolve uma
 * estrutura editável (imperfeita é aceitável — o usuário corrige na UI).
 *
 * Regras por tipo de linha:
 *  - PALAVRA-CHAVE incondicional: "Capítulo N" abre capítulo, "Exercício N" é exercício.
 *  - Regra 3 (NUMERADA / BULLET) — indentação primeiro, ORIGEM desempata:
 *    1. mais indentada que o capítulo aberto → exercício dele (Hal Leonard/Jaco);
 *    2. mesmo nível / à esquerda → desempata: capítulo aberto por PALAVRA-CHAVE →
 *       exercício ("Capítulo 1" + numerados flush-left); aberto por número/bullet →
 *       capítulo-irmão (índice numerado puro; capítulos numerados do Jaco).
 *  - Regra 4 (LINHA SIMPLES, sem marcador) — SÓ indentação, SEM desempate por origem:
 *    indentada → exercício; flush-left → SEMPRE capítulo-irmão. Um título de seção sem
 *    marcador, alinhado à esquerda, sinaliza heading, não item de lista — e isso não
 *    muda com a origem do capítulo pai.
 */
export function parseSyllabus(text: string): ParsedChapter[] {
  const chapters: ParsedChapter[] = [];
  let current: ParsedChapter | null = null;
  let currentChapterIndent = 0; // indentação da linha que abriu o capítulo corrente
  let currentChapterFromKeyword = false; // foi aberto por palavra-chave (Capítulo/Chapter/...)?

  const openChapter = (title: string, indent: number, fromKeyword: boolean) => {
    current = { title, exercises: [] };
    chapters.push(current);
    currentChapterIndent = indent;
    currentChapterFromKeyword = fromKeyword;
  };
  const addExercise = (label: string, indent: number) => {
    if (!current) openChapter(PLACEHOLDER_CHAPTER, indent, false); // exercício antes de capítulo
    current!.exercises.push({ label });
  };

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === "") continue;
    const indent = indentOf(rawLine);

    // Palavras-chave: incondicionais (não dependem de indentação).
    if (CHAPTER_RE.test(line)) {
      openChapter(line, indent, true);
      continue;
    }
    if (EXERCISE_RE.test(line)) {
      addExercise(line, indent);
      continue;
    }

    // Regra 3 — NUMERADA / BULLET: indentação primeiro, origem desempata no empate.
    if (LIST_RE.test(line)) {
      if (!current) {
        openChapter(line, indent, false); // primeiro item = capítulo (índice do topo)
      } else if (indent > currentChapterIndent) {
        addExercise(line, indent); // mais indentada → exercício
      } else if (currentChapterFromKeyword) {
        addExercise(line, indent); // mesmo nível sob capítulo de palavra-chave → exercício
      } else {
        openChapter(line, indent, false); // mesmo nível sob capítulo numerado → irmão
      }
      continue;
    }

    // Regra 4 — LINHA SIMPLES (sem marcador): SÓ indentação, sem desempate por origem.
    if (!current || indent <= currentChapterIndent) {
      openChapter(line, indent, false); // flush-left = heading → sempre capítulo-irmão
    } else {
      addExercise(line, indent); // indentada sob o capítulo aberto → exercício
    }
  }

  return chapters;
}
