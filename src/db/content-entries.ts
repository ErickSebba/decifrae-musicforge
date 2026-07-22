import { initDb } from "./database";
import type { ContentEntry } from "../engine/theory-engine";
import { THEORY_CONTENT, sectionsToBody, type TheoryTopicId } from "../data/theory-content-seed";

/**
 * Central de Conteúdo — acesso à tabela content_entries (2.4, adiantando o Módulo 3.4).
 * Espelha o padrão do level-progress.ts: regras em JS testáveis com banco mockado +
 * fallback em memória no modo web (npm run dev sem Tauri), com warn UMA vez.
 *
 * Seed LAZY e IDEMPOTENTE: na primeira leitura, se a tabela estiver VAZIA, insere as
 * 12 entradas de teoria geradas de THEORY_CONTENT (checagem única por COUNT — simples
 * e auditável, não INSERT OR IGNORE linha a linha). review_status inicial "confirmado":
 * o usuário é o AUTOR do conteúdo, já validado contra as fontes dele — não é texto
 * gerado pelo app aguardando revisão.
 */

interface ContentRow {
  id: string;
  topic: string;
  title: string;
  body: string;
  review_status: string;
  note: string;
  created_at: string;
}

const memoryStore = new Map<string, ContentEntry>();
let dbUnavailable = false;
let warnedOnce = false;
let seedPromise: Promise<void> | null = null;

function warnFallback(error: unknown) {
  dbUnavailable = true;
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(
      "[content-entries] SQLite indisponível (modo web sem Tauri?) — conteúdo só em memória nesta sessão.",
      error
    );
  }
}

function rowToEntry(row: ContentRow): ContentEntry {
  return {
    id: row.id,
    topic: row.topic,
    title: row.title,
    body: row.body,
    reviewStatus: row.review_status as ContentEntry["reviewStatus"],
    note: row.note,
    createdAt: row.created_at,
  };
}

/** As 12 entradas de teoria geradas da fonte única (theory-content-seed). */
function buildSeedEntries(): ContentEntry[] {
  const createdAt = new Date().toISOString();
  return (Object.keys(THEORY_CONTENT) as TheoryTopicId[]).map((topic) => ({
    id: `theory-${topic}`,
    topic,
    title: THEORY_CONTENT[topic].title,
    body: sectionsToBody(THEORY_CONTENT[topic].sections),
    reviewStatus: "confirmado" as const,
    note: "",
    createdAt,
  }));
}

function seedMemoryIfEmpty() {
  if (memoryStore.size > 0) return;
  for (const entry of buildSeedEntries()) {
    memoryStore.set(entry.id, entry);
  }
}

async function seedDbIfEmpty(): Promise<void> {
  const db = await initDb();
  const rows = await db.select<{ n: number }[]>("SELECT COUNT(*) AS n FROM content_entries");
  if ((rows[0]?.n ?? 0) > 0) return; // já semeado — idempotência por checagem única
  for (const e of buildSeedEntries()) {
    await db.execute(
      `INSERT INTO content_entries (id, topic, title, body, review_status, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [e.id, e.topic, e.title, e.body, e.reviewStatus, e.note, e.createdAt]
    );
  }
}

/** Garante o seed uma única vez por sessão (promise cacheada); cai pro fallback se o banco faltar. */
function ensureSeeded(): Promise<void> {
  if (!seedPromise) {
    seedPromise = seedDbIfEmpty().catch((error) => {
      warnFallback(error);
      seedMemoryIfEmpty();
    });
  }
  return seedPromise;
}

/** Todas as entradas da Central de Conteúdo. */
export async function getContentEntries(): Promise<ContentEntry[]> {
  await ensureSeeded();
  if (dbUnavailable) return [...memoryStore.values()];
  try {
    const db = await initDb();
    const rows = await db.select<ContentRow[]>("SELECT * FROM content_entries");
    return rows.map(rowToEntry);
  } catch (error) {
    warnFallback(error);
    seedMemoryIfEmpty();
    return [...memoryStore.values()];
  }
}

/** Entrada de um topic (ex.: "dorian"), ou null se não existir. */
export async function getContentEntryByTopic(topic: string): Promise<ContentEntry | null> {
  await ensureSeeded();
  if (dbUnavailable) {
    return [...memoryStore.values()].find((e) => e.topic === topic) ?? null;
  }
  try {
    const db = await initDb();
    const rows = await db.select<ContentRow[]>(
      "SELECT * FROM content_entries WHERE topic = $1",
      [topic]
    );
    return rows[0] ? rowToEntry(rows[0]) : null;
  } catch (error) {
    warnFallback(error);
    seedMemoryIfEmpty();
    return [...memoryStore.values()].find((e) => e.topic === topic) ?? null;
  }
}

/** Update em memória com a MESMA regra de negócio (id inexistente lança). */
function updateReviewInMemory(
  id: string,
  reviewStatus: ContentEntry["reviewStatus"],
  note: string
) {
  const entry = memoryStore.get(id);
  if (!entry) throw new Error(`Entrada de conteúdo não encontrada: ${id}`);
  memoryStore.set(id, { ...entry, reviewStatus, note });
}

/**
 * Atualiza a revisão de uma entrada (3.4 — a tela de revisão é só UI por cima disto).
 * Lê antes de gravar: id inexistente LANÇA (erro de negócio, não engolido pelo fallback).
 */
export async function updateContentEntryReview(
  id: string,
  reviewStatus: ContentEntry["reviewStatus"],
  note: string
): Promise<void> {
  await ensureSeeded();
  if (dbUnavailable) {
    updateReviewInMemory(id, reviewStatus, note);
    return;
  }
  try {
    const db = await initDb();
    const rows = await db.select<ContentRow[]>("SELECT * FROM content_entries WHERE id = $1", [
      id,
    ]);
    if (!rows[0]) throw new Error(`Entrada de conteúdo não encontrada: ${id}`);
    await db.execute("UPDATE content_entries SET review_status = $2, note = $3 WHERE id = $1", [
      id,
      reviewStatus,
      note,
    ]);
  } catch (error) {
    if (error instanceof Error && error.message.includes("não encontrada")) throw error;
    warnFallback(error);
    seedMemoryIfEmpty();
    updateReviewInMemory(id, reviewStatus, note);
  }
}

/** Só para testes: reseta fallback em memória e o cache do seed. */
export function _resetContentEntriesFallback() {
  memoryStore.clear();
  dbUnavailable = false;
  warnedOnce = false;
  seedPromise = null;
}
