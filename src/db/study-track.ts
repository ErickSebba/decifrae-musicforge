import { initDb } from "./database";
import type { ParsedChapter, StudyStatus } from "../engine/study-track";

/**
 * CRUD da trilha de estudo externa (3.2) — livros/capítulos/exercícios NO BANCO
 * (reversão do modelo fixo-no-código; substitui study-track-progress.ts). Mesmo padrão
 * do resto de src/db: regras/integridade em JS, fallback em memória (warn 1×), cascade
 * em JS. Status de capítulo/livro é DERIVADO na leitura (engine study-track.ts) — aqui só
 * persistimos o conteúdo + o status por exercício + own_status de capítulo sem exercícios.
 */

export interface StudyBook {
  id: string;
  title: string;
  author: string;
  position: number;
  createdAt: string;
}
export interface StudyChapter {
  id: string;
  bookId: string;
  position: number;
  title: string;
  ownStatus: StudyStatus | null;
  createdAt: string;
}
export interface StudyExercise {
  id: string;
  chapterId: string;
  position: number;
  label: string;
  status: StudyStatus;
  createdAt: string;
}

interface BookRow {
  id: string;
  title: string;
  author: string;
  position: number;
  created_at: string;
}
interface ChapterRow {
  id: string;
  book_id: string;
  position: number;
  title: string;
  own_status: string | null;
  created_at: string;
}
interface ExerciseRow {
  id: string;
  chapter_id: string;
  position: number;
  label: string;
  status: string;
  created_at: string;
}

// Fallback em memória (modo web sem Tauri) — mesmas regras.
const memBooks = new Map<string, StudyBook>();
const memChapters = new Map<string, StudyChapter>();
const memExercises = new Map<string, StudyExercise>();
let dbUnavailable = false;
let warnedOnce = false;

function warnFallback(error: unknown) {
  dbUnavailable = true;
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(
      "[study-track] SQLite indisponível (modo web sem Tauri?) — trilha só em memória nesta sessão.",
      error
    );
  }
}

function seedMemoryIfEmpty() {
  // Espelha o seed da migração v2 (os 6 livros), pra a tela web não nascer vazia.
  if (memBooks.size > 0) return;
  const seed = [
    ["seed-hal-leonard", "Hal Leonard Bass Method"],
    ["seed-jaco", "Jaco Pastorius Bass Method"],
    ["seed-simandl", "Simandl"],
    ["seed-ariane-cap", "Ariane Cap"],
    ["seed-rufus-reid", "Rufus Reid"],
    ["seed-gary-willis", "Gary Willis"],
  ];
  seed.forEach(([id, title], i) => {
    memBooks.set(id, { id, title, author: "", position: i, createdAt: new Date().toISOString() });
  });
}

const bookToRow = (r: BookRow): StudyBook => ({
  id: r.id,
  title: r.title,
  author: r.author,
  position: r.position,
  createdAt: r.created_at,
});
const chapterToRow = (r: ChapterRow): StudyChapter => ({
  id: r.id,
  bookId: r.book_id,
  position: r.position,
  title: r.title,
  ownStatus: (r.own_status as StudyStatus | null) ?? null,
  createdAt: r.created_at,
});
const exerciseToRow = (r: ExerciseRow): StudyExercise => ({
  id: r.id,
  chapterId: r.chapter_id,
  position: r.position,
  label: r.label,
  status: r.status as StudyStatus,
  createdAt: r.created_at,
});

const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position;

// ————————————————————————— LEITURA —————————————————————————

export async function getStudyBooks(): Promise<StudyBook[]> {
  if (dbUnavailable) {
    seedMemoryIfEmpty();
    return [...memBooks.values()].sort(byPosition);
  }
  try {
    const db = await initDb();
    const rows = await db.select<BookRow[]>("SELECT * FROM study_books");
    return rows.map(bookToRow).sort(byPosition);
  } catch (error) {
    warnFallback(error);
    seedMemoryIfEmpty();
    return [...memBooks.values()].sort(byPosition);
  }
}

export async function getChapters(bookId: string): Promise<StudyChapter[]> {
  if (dbUnavailable) {
    return [...memChapters.values()].filter((c) => c.bookId === bookId).sort(byPosition);
  }
  try {
    const db = await initDb();
    const rows = await db.select<ChapterRow[]>(
      "SELECT * FROM study_chapters WHERE book_id = $1",
      [bookId]
    );
    return rows.map(chapterToRow).sort(byPosition);
  } catch (error) {
    warnFallback(error);
    return [...memChapters.values()].filter((c) => c.bookId === bookId).sort(byPosition);
  }
}

export async function getExercises(chapterId: string): Promise<StudyExercise[]> {
  if (dbUnavailable) {
    return [...memExercises.values()].filter((e) => e.chapterId === chapterId).sort(byPosition);
  }
  try {
    const db = await initDb();
    const rows = await db.select<ExerciseRow[]>(
      "SELECT * FROM study_exercises WHERE chapter_id = $1",
      [chapterId]
    );
    return rows.map(exerciseToRow).sort(byPosition);
  } catch (error) {
    warnFallback(error);
    return [...memExercises.values()].filter((e) => e.chapterId === chapterId).sort(byPosition);
  }
}

// ————————————————————————— ESCRITA (helpers) —————————————————————————

/** Próxima position (append) num conjunto filtrado. */
function nextPosition<T extends { position: number }>(items: T[]): number {
  return items.length === 0 ? 0 : Math.max(...items.map((i) => i.position)) + 1;
}

async function run(sql: string, params: unknown[], memFallback: () => void): Promise<void> {
  if (dbUnavailable) {
    memFallback();
    return;
  }
  try {
    const db = await initDb();
    await db.execute(sql, params);
  } catch (error) {
    warnFallback(error);
    memFallback();
  }
}

// ————————————————————————— LIVROS —————————————————————————

export async function createBook(title: string, author = ""): Promise<StudyBook> {
  const name = title.trim();
  if (!name) throw new Error("Livro precisa de título");
  const books = await getStudyBooks();
  const book: StudyBook = {
    id: crypto.randomUUID(),
    title: name,
    author: author.trim(),
    position: nextPosition(books),
    createdAt: new Date().toISOString(),
  };
  await run(
    `INSERT INTO study_books (id, title, author, position, created_at) VALUES ($1,$2,$3,$4,$5)`,
    [book.id, book.title, book.author, book.position, book.createdAt],
    () => memBooks.set(book.id, book)
  );
  return book;
}

export async function updateBook(
  id: string,
  patch: { title?: string; author?: string }
): Promise<void> {
  const book = (await getStudyBooks()).find((b) => b.id === id);
  if (!book) throw new Error(`Livro não encontrado: ${id}`);
  const title = patch.title !== undefined ? patch.title.trim() : book.title;
  if (!title) throw new Error("Livro precisa de título");
  const author = patch.author !== undefined ? patch.author.trim() : book.author;
  await run(
    "UPDATE study_books SET title = $2, author = $3 WHERE id = $1",
    [id, title, author],
    () => memBooks.set(id, { ...book, title, author })
  );
}

/** Deleta o livro e, em cascata (JS), seus capítulos e exercícios. */
export async function deleteBook(id: string): Promise<void> {
  const chapters = await getChapters(id);
  for (const ch of chapters) await deleteChapterCascade(ch.id);
  await run("DELETE FROM study_books WHERE id = $1", [id], () => memBooks.delete(id));
}

// ————————————————————————— CAPÍTULOS —————————————————————————

export async function addChapter(bookId: string, title: string): Promise<StudyChapter> {
  const name = title.trim();
  if (!name) throw new Error("Capítulo precisa de título");
  const chapters = await getChapters(bookId);
  const chapter: StudyChapter = {
    id: crypto.randomUUID(),
    bookId,
    position: nextPosition(chapters),
    title: name,
    ownStatus: null,
    createdAt: new Date().toISOString(),
  };
  await run(
    `INSERT INTO study_chapters (id, book_id, position, title, own_status, created_at)
     VALUES ($1,$2,$3,$4,NULL,$5)`,
    [chapter.id, bookId, chapter.position, chapter.title, chapter.createdAt],
    () => memChapters.set(chapter.id, chapter)
  );
  return chapter;
}

export async function renameChapter(id: string, title: string): Promise<void> {
  const name = title.trim();
  if (!name) throw new Error("Capítulo precisa de título");
  await run(
    "UPDATE study_chapters SET title = $2 WHERE id = $1",
    [id, name],
    () => {
      const c = memChapters.get(id);
      if (c) memChapters.set(id, { ...c, title: name });
    }
  );
}

export async function setChapterOwnStatus(id: string, status: StudyStatus): Promise<void> {
  await run(
    "UPDATE study_chapters SET own_status = $2 WHERE id = $1",
    [id, status],
    () => {
      const c = memChapters.get(id);
      if (c) memChapters.set(id, { ...c, ownStatus: status });
    }
  );
}

async function deleteChapterCascade(id: string): Promise<void> {
  const exercises = await getExercises(id);
  for (const ex of exercises) {
    await run("DELETE FROM study_exercises WHERE id = $1", [ex.id], () =>
      memExercises.delete(ex.id)
    );
  }
  await run("DELETE FROM study_chapters WHERE id = $1", [id], () => memChapters.delete(id));
}

export const removeChapter = deleteChapterCascade;

// ————————————————————————— EXERCÍCIOS —————————————————————————

export async function addExercise(chapterId: string, label: string): Promise<StudyExercise> {
  const text = label.trim();
  if (!text) throw new Error("Exercício precisa de rótulo");
  const exercises = await getExercises(chapterId);
  const exercise: StudyExercise = {
    id: crypto.randomUUID(),
    chapterId,
    position: nextPosition(exercises),
    label: text,
    status: "nao_iniciado",
    createdAt: new Date().toISOString(),
  };
  await run(
    `INSERT INTO study_exercises (id, chapter_id, position, label, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [exercise.id, chapterId, exercise.position, exercise.label, exercise.status, exercise.createdAt],
    () => memExercises.set(exercise.id, exercise)
  );
  return exercise;
}

export async function renameExercise(id: string, label: string): Promise<void> {
  const text = label.trim();
  if (!text) throw new Error("Exercício precisa de rótulo");
  await run(
    "UPDATE study_exercises SET label = $2 WHERE id = $1",
    [id, text],
    () => {
      const e = memExercises.get(id);
      if (e) memExercises.set(id, { ...e, label: text });
    }
  );
}

export async function setExerciseStatus(id: string, status: StudyStatus): Promise<void> {
  await run(
    "UPDATE study_exercises SET status = $2 WHERE id = $1",
    [id, status],
    () => {
      const e = memExercises.get(id);
      if (e) memExercises.set(id, { ...e, status });
    }
  );
}

export async function removeExercise(id: string): Promise<void> {
  await run("DELETE FROM study_exercises WHERE id = $1", [id], () => memExercises.delete(id));
}

// ————————————————————————— REORDENAÇÃO (troca de position com o vizinho) —————————————————————————

async function swapPosition(
  table: "study_books" | "study_chapters" | "study_exercises",
  a: { id: string; position: number },
  b: { id: string; position: number },
  memApply: (id: string, position: number) => void
): Promise<void> {
  await run(`UPDATE ${table} SET position = $2 WHERE id = $1`, [a.id, b.position], () =>
    memApply(a.id, b.position)
  );
  await run(`UPDATE ${table} SET position = $2 WHERE id = $1`, [b.id, a.position], () =>
    memApply(b.id, a.position)
  );
}

/** Reordena um livro trocando a position com o vizinho (mesmo padrão de capítulo/exercício). */
export async function moveBook(id: string, dir: "up" | "down"): Promise<void> {
  const books = await getStudyBooks(); // já ordenado por position
  const idx = books.findIndex((b) => b.id === id);
  if (idx < 0) return;
  const target = dir === "up" ? books[idx - 1] : books[idx + 1];
  if (!target) return;
  await swapPosition("study_books", books[idx], target, (bid, position) => {
    const b = memBooks.get(bid);
    if (b) memBooks.set(bid, { ...b, position });
  });
}

/** Acha um capítulo pelo id (db ou mem) — precisamos do bookId pra pegar os irmãos. */
async function findChapter(id: string): Promise<StudyChapter | null> {
  if (dbUnavailable) return memChapters.get(id) ?? null;
  try {
    const db = await initDb();
    const rows = await db.select<ChapterRow[]>("SELECT * FROM study_chapters WHERE id = $1", [id]);
    return rows[0] ? chapterToRow(rows[0]) : null;
  } catch (error) {
    warnFallback(error);
    return memChapters.get(id) ?? null;
  }
}

async function findExercise(id: string): Promise<StudyExercise | null> {
  if (dbUnavailable) return memExercises.get(id) ?? null;
  try {
    const db = await initDb();
    const rows = await db.select<ExerciseRow[]>("SELECT * FROM study_exercises WHERE id = $1", [id]);
    return rows[0] ? exerciseToRow(rows[0]) : null;
  } catch (error) {
    warnFallback(error);
    return memExercises.get(id) ?? null;
  }
}

export async function moveChapter(id: string, dir: "up" | "down"): Promise<void> {
  const chapter = await findChapter(id);
  if (!chapter) return;
  const siblings = await getChapters(chapter.bookId); // já ordenado por position
  const idx = siblings.findIndex((c) => c.id === id);
  const target = dir === "up" ? siblings[idx - 1] : siblings[idx + 1];
  if (!target) return;
  await swapPosition("study_chapters", chapter, target, (cid, position) => {
    const c = memChapters.get(cid);
    if (c) memChapters.set(cid, { ...c, position });
  });
}

export async function moveExercise(id: string, dir: "up" | "down"): Promise<void> {
  const exercise = await findExercise(id);
  if (!exercise) return;
  const siblings = await getExercises(exercise.chapterId);
  const idx = siblings.findIndex((e) => e.id === id);
  const target = dir === "up" ? siblings[idx - 1] : siblings[idx + 1];
  if (!target) return;
  await swapPosition("study_exercises", exercise, target, (eid, position) => {
    const e = memExercises.get(eid);
    if (e) memExercises.set(eid, { ...e, position });
  });
}

// ————————————————————————— IMPORTAÇÃO —————————————————————————

/** Insere em lote o resultado do parser, APÓS os capítulos já existentes do livro. */
export async function importSyllabus(bookId: string, parsed: ParsedChapter[]): Promise<void> {
  let chapterPos = nextPosition(await getChapters(bookId));
  for (const pc of parsed) {
    const chapter = await addChapterAt(bookId, pc.title, chapterPos++);
    let exPos = 0;
    for (const pe of pc.exercises) {
      await addExerciseAt(chapter.id, pe.label, exPos++);
    }
  }
}

async function addChapterAt(bookId: string, title: string, position: number): Promise<StudyChapter> {
  const chapter: StudyChapter = {
    id: crypto.randomUUID(),
    bookId,
    position,
    title: title.trim() || "(sem título)",
    ownStatus: null,
    createdAt: new Date().toISOString(),
  };
  await run(
    `INSERT INTO study_chapters (id, book_id, position, title, own_status, created_at)
     VALUES ($1,$2,$3,$4,NULL,$5)`,
    [chapter.id, bookId, chapter.position, chapter.title, chapter.createdAt],
    () => memChapters.set(chapter.id, chapter)
  );
  return chapter;
}

async function addExerciseAt(chapterId: string, label: string, position: number): Promise<void> {
  const exercise: StudyExercise = {
    id: crypto.randomUUID(),
    chapterId,
    position,
    label: label.trim() || "(sem rótulo)",
    status: "nao_iniciado",
    createdAt: new Date().toISOString(),
  };
  await run(
    `INSERT INTO study_exercises (id, chapter_id, position, label, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6)`,
    [exercise.id, chapterId, position, exercise.label, exercise.status, exercise.createdAt],
    () => memExercises.set(exercise.id, exercise)
  );
}

/** Só para testes: reseta o estado do fallback em memória. */
export function _resetStudyTrackFallback() {
  memBooks.clear();
  memChapters.clear();
  memExercises.clear();
  dbUnavailable = false;
  warnedOnce = false;
}
