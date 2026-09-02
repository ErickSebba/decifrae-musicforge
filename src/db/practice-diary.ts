import { initDb } from "./database";
import { localDayString } from "./exercise-progress";

/**
 * Banco de exercícios + diário de sessões de prática real (Módulo 5). Exercícios são
 * dado do USUÁRIO (uuid), sessões individuais alimentam a sugestão adaptativa e o
 * recorde de BPM — agregados do M5 são DERIVADOS das sessões na leitura (fonte única).
 *
 * Regras (JS, testáveis):
 * - complexity/rating clampados em 1..5 (escala configurável nas constantes);
 * - SEM hard delete: archiveExercise preserva o histórico do diário;
 * - exercício arquivado NÃO aceita sessão nova;
 * - addSession valida a existência do exercício (integridade da "FK" em JS — padrão do
 *   projeto; o PRAGMA de foreign keys do plugin não é confiável).
 * Erros de NEGÓCIO lançam SEMPRE (não são engolidos pelo fallback): as validações rodam
 * ANTES de qualquer write, sobre leituras que já têm fallback próprio.
 */

export const COMPLEXITY_MIN = 1;
export const COMPLEXITY_MAX = 5;
export const RATING_MIN = 1;
export const RATING_MAX = 5;

export interface Exercise {
  id: string;
  name: string;
  category: string; // texto livre — categorias são do usuário
  complexity: number; // 1..5
  targetBpm: number | null;
  archived: boolean;
  createdAt: string;
}

export interface PracticeSession {
  id: string;
  exerciseId: string;
  practicedOn: string; // 'YYYY-MM-DD' local; backdating permitido
  bpm: number | null;
  durationMin: number | null;
  rating: number | null; // 1..5
  note: string;
  createdAt: string;
}

export interface ExerciseInput {
  name: string;
  category: string;
  complexity: number;
  targetBpm?: number | null;
}

export interface SessionInput {
  exerciseId: string;
  practicedOn?: string; // default: hoje (dia local)
  bpm?: number | null;
  durationMin?: number | null;
  rating?: number | null;
  note?: string;
}

interface ExerciseRow {
  id: string;
  name: string;
  category: string;
  complexity: number;
  target_bpm: number | null;
  archived: number;
  created_at: string;
}

interface SessionRow {
  id: string;
  exercise_id: string;
  practiced_on: string;
  bpm: number | null;
  duration_min: number | null;
  rating: number | null;
  note: string;
  created_at: string;
}

const memoryExercises = new Map<string, Exercise>();
const memorySessions = new Map<string, PracticeSession>();
let dbUnavailable = false;
let warnedOnce = false;

function warnFallback(error: unknown) {
  dbUnavailable = true;
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(
      "[practice-diary] SQLite indisponível (modo web sem Tauri?) — diário só em memória nesta sessão.",
      error
    );
  }
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)));

function rowToExercise(row: ExerciseRow): Exercise {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    complexity: row.complexity,
    targetBpm: row.target_bpm,
    archived: row.archived !== 0,
    createdAt: row.created_at,
  };
}

function rowToSession(row: SessionRow): PracticeSession {
  return {
    id: row.id,
    exerciseId: row.exercise_id,
    practicedOn: row.practiced_on,
    bpm: row.bpm,
    durationMin: row.duration_min,
    rating: row.rating,
    note: row.note,
    createdAt: row.created_at,
  };
}

async function writeExercise(exercise: Exercise): Promise<void> {
  if (dbUnavailable) {
    memoryExercises.set(exercise.id, exercise);
    return;
  }
  try {
    const db = await initDb();
    await db.execute(
      `INSERT OR REPLACE INTO exercises (id, name, category, complexity, target_bpm, archived, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        exercise.id,
        exercise.name,
        exercise.category,
        exercise.complexity,
        exercise.targetBpm,
        exercise.archived ? 1 : 0,
        exercise.createdAt,
      ]
    );
  } catch (error) {
    warnFallback(error);
    memoryExercises.set(exercise.id, exercise);
  }
}

/** Exercícios cadastrados (arquivados ficam de fora por padrão). */
export async function getExercises(includeArchived = false): Promise<Exercise[]> {
  let all: Exercise[];
  if (dbUnavailable) {
    all = [...memoryExercises.values()];
  } else {
    try {
      const db = await initDb();
      const rows = await db.select<ExerciseRow[]>("SELECT * FROM exercises");
      all = rows.map(rowToExercise);
    } catch (error) {
      warnFallback(error);
      all = [...memoryExercises.values()];
    }
  }
  return includeArchived ? all : all.filter((e) => !e.archived);
}

/** Cadastra um exercício novo (complexity clampada em 1..5; name obrigatório). */
export async function createExercise(input: ExerciseInput): Promise<Exercise> {
  const name = input.name.trim();
  if (!name) throw new Error("Exercício precisa de nome");
  const exercise: Exercise = {
    id: crypto.randomUUID(),
    name,
    category: input.category.trim(),
    complexity: clamp(input.complexity, COMPLEXITY_MIN, COMPLEXITY_MAX),
    targetBpm: input.targetBpm ?? null,
    archived: false,
    createdAt: new Date().toISOString(),
  };
  await writeExercise(exercise);
  return exercise;
}

async function requireExercise(id: string): Promise<Exercise> {
  const exercise = (await getExercises(true)).find((e) => e.id === id);
  if (!exercise) throw new Error(`Exercício não encontrado: ${id}`);
  return exercise;
}

/** Atualiza campos do cadastro (patch parcial; complexity re-clampada se vier). */
export async function updateExercise(
  id: string,
  patch: Partial<ExerciseInput>
): Promise<Exercise> {
  const current = await requireExercise(id);
  const updated: Exercise = {
    ...current,
    name: patch.name !== undefined ? patch.name.trim() : current.name,
    category: patch.category !== undefined ? patch.category.trim() : current.category,
    complexity:
      patch.complexity !== undefined
        ? clamp(patch.complexity, COMPLEXITY_MIN, COMPLEXITY_MAX)
        : current.complexity,
    targetBpm: patch.targetBpm !== undefined ? patch.targetBpm : current.targetBpm,
  };
  if (!updated.name) throw new Error("Exercício precisa de nome");
  await writeExercise(updated);
  return updated;
}

/** Arquiva (nunca deleta — o diário é histórico). Idempotente. */
export async function archiveExercise(id: string): Promise<void> {
  const current = await requireExercise(id);
  if (current.archived) return;
  await writeExercise({ ...current, archived: true });
}

/** Sessões do diário (todas, ou só de um exercício), mais recentes primeiro. */
export async function getSessions(exerciseId?: string): Promise<PracticeSession[]> {
  let all: PracticeSession[];
  if (dbUnavailable) {
    all = [...memorySessions.values()];
  } else {
    try {
      const db = await initDb();
      const rows = exerciseId
        ? await db.select<SessionRow[]>(
            "SELECT * FROM practice_sessions WHERE exercise_id = $1",
            [exerciseId]
          )
        : await db.select<SessionRow[]>("SELECT * FROM practice_sessions");
      all = rows.map(rowToSession);
    } catch (error) {
      warnFallback(error);
      all = [...memorySessions.values()];
    }
  }
  const filtered = exerciseId ? all.filter((s) => s.exerciseId === exerciseId) : all;
  return filtered.sort((a, b) =>
    a.practicedOn === b.practicedOn
      ? b.createdAt.localeCompare(a.createdAt)
      : b.practicedOn.localeCompare(a.practicedOn)
  );
}

/** Registra uma sessão de prática real (valida exercício existente e não-arquivado). */
export async function addSession(input: SessionInput): Promise<PracticeSession> {
  const exercise = await requireExercise(input.exerciseId);
  if (exercise.archived) {
    throw new Error(`Exercício arquivado não aceita sessão nova: ${exercise.name}`);
  }
  const session: PracticeSession = {
    id: crypto.randomUUID(),
    exerciseId: input.exerciseId,
    practicedOn: input.practicedOn ?? localDayString(new Date()),
    bpm: input.bpm ?? null,
    durationMin: input.durationMin ?? null,
    rating: input.rating != null ? clamp(input.rating, RATING_MIN, RATING_MAX) : null,
    note: input.note ?? "",
    createdAt: new Date().toISOString(),
  };
  if (dbUnavailable) {
    memorySessions.set(session.id, session);
    return session;
  }
  try {
    const db = await initDb();
    await db.execute(
      `INSERT INTO practice_sessions
         (id, exercise_id, practiced_on, bpm, duration_min, rating, note, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        session.id,
        session.exerciseId,
        session.practicedOn,
        session.bpm,
        session.durationMin,
        session.rating,
        session.note,
        session.createdAt,
      ]
    );
  } catch (error) {
    warnFallback(error);
    memorySessions.set(session.id, session);
  }
  return session;
}

/**
 * Apaga uma sessão (5a). Sessão é registro pontual sem histórico atrelado → DELETA
 * de verdade (diferente do exercício, que se ARQUIVA por ter sessões atreladas).
 * Apagar id inexistente é no-op inofensivo — sem validação de negócio.
 */
export async function deleteSession(id: string): Promise<void> {
  if (dbUnavailable) {
    memorySessions.delete(id);
    return;
  }
  try {
    const db = await initDb();
    await db.execute("DELETE FROM practice_sessions WHERE id = $1", [id]);
  } catch (error) {
    warnFallback(error);
    memorySessions.delete(id);
  }
}

/** Só para testes: reseta o estado do fallback em memória. */
export function _resetPracticeDiaryFallback() {
  memoryExercises.clear();
  memorySessions.clear();
  dbUnavailable = false;
  warnedOnce = false;
}
