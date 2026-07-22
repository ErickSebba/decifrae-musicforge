import { initDb } from "./database";

/**
 * Progresso da trilha de estudo externa (3.2). O conteúdo (livros/capítulos/exercícios)
 * é FIXO no código — aqui vive só o progresso do usuário sobre ids estáveis desse
 * conteúdo. AUSÊNCIA de linha = 'nao_iniciado' (padrão derivado, não armazenado — mesmo
 * ethos do desbloqueio derivado do Tap): marcar de volta como 'nao_iniciado' DELETA a
 * linha. Transições livres (é um checklist manual; pode regredir à vontade).
 * Mesmo padrão do level-progress: regras em JS, fallback em memória, warn UMA vez.
 */

export type StudyItemStatus = "nao_iniciado" | "em_andamento" | "concluido";

export interface StudyItemProgress {
  itemId: string; // id estável do item fixo no código (ex.: 'hal-leonard-1:cap3:ex12')
  status: Exclude<StudyItemStatus, "nao_iniciado">;
  updatedAt: string;
}

interface StudyRow {
  item_id: string;
  status: string;
  updated_at: string;
}

const memoryStore = new Map<string, StudyItemProgress>();
let dbUnavailable = false;
let warnedOnce = false;

function warnFallback(error: unknown) {
  dbUnavailable = true;
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(
      "[study-track-progress] SQLite indisponível (modo web sem Tauri?) — progresso só em memória nesta sessão.",
      error
    );
  }
}

function rowToProgress(row: StudyRow): StudyItemProgress {
  return {
    itemId: row.item_id,
    status: row.status as StudyItemProgress["status"],
    updatedAt: row.updated_at,
  };
}

/** Itens com status registrado (os demais são 'nao_iniciado' por ausência). */
export async function getStudyTrackProgress(): Promise<StudyItemProgress[]> {
  if (dbUnavailable) return [...memoryStore.values()];
  try {
    const db = await initDb();
    const rows = await db.select<StudyRow[]>("SELECT * FROM study_track_progress");
    return rows.map(rowToProgress);
  } catch (error) {
    warnFallback(error);
    return [...memoryStore.values()];
  }
}

function setInMemory(itemId: string, status: StudyItemStatus) {
  if (status === "nao_iniciado") {
    memoryStore.delete(itemId);
    return;
  }
  memoryStore.set(itemId, { itemId, status, updatedAt: new Date().toISOString() });
}

/** Define o status de um item; 'nao_iniciado' remove a linha (default por ausência). */
export async function setStudyItemStatus(itemId: string, status: StudyItemStatus): Promise<void> {
  if (dbUnavailable) {
    setInMemory(itemId, status);
    return;
  }
  try {
    const db = await initDb();
    if (status === "nao_iniciado") {
      await db.execute("DELETE FROM study_track_progress WHERE item_id = $1", [itemId]);
      return;
    }
    await db.execute(
      `INSERT OR REPLACE INTO study_track_progress (item_id, status, updated_at)
       VALUES ($1, $2, $3)`,
      [itemId, status, new Date().toISOString()]
    );
  } catch (error) {
    warnFallback(error);
    setInMemory(itemId, status);
  }
}

/** Só para testes: reseta o estado do fallback em memória. */
export function _resetStudyTrackFallback() {
  memoryStore.clear();
  dbUnavailable = false;
  warnedOnce = false;
}
