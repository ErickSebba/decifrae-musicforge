import { initDb } from "./database";

/**
 * Progresso do mapa de teoria (3.3). O grafo de tópicos é FIXO no código — aqui vive só
 * o status do usuário por nó (id estável). AUSÊNCIA de linha = 'nao_iniciado'.
 *
 * REGRA (decidida no plano da 3+5.0): ordem nao_iniciado < estudando < praticado <
 * dominado. Origin 'manual' grava exatamente o pedido (livre, inclusive rebaixar;
 * 'nao_iniciado' → DELETE). Origin 'auto' (vinda de exercício concluído) só PROMOVE —
 * nunca rebaixa, nunca deleta; se o usuário rebaixou na mão e praticou de novo, o auto
 * pode re-promover (praticou → praticado). Regra pura em resolveTheoryStatus, testável
 * isolada. Mesmo padrão de fallback do level-progress.
 */

export type TheoryNodeStatus = "nao_iniciado" | "estudando" | "praticado" | "dominado";
export type TheoryStatusOrigin = "manual" | "auto";

export interface TheoryNodeProgress {
  nodeId: string; // id estável do nó do grafo fixo no código
  status: Exclude<TheoryNodeStatus, "nao_iniciado">;
  updatedAt: string;
}

const STATUS_ORDER: TheoryNodeStatus[] = ["nao_iniciado", "estudando", "praticado", "dominado"];

/**
 * Resolve o status final dado o atual e o pedido. Puro: manual = pedido exato;
 * auto = max(atual, pedido) na ordem (só promove).
 */
export function resolveTheoryStatus(
  current: TheoryNodeStatus,
  requested: TheoryNodeStatus,
  origin: TheoryStatusOrigin
): TheoryNodeStatus {
  if (origin === "manual") return requested;
  return STATUS_ORDER.indexOf(requested) > STATUS_ORDER.indexOf(current) ? requested : current;
}

interface TheoryRow {
  node_id: string;
  status: string;
  updated_at: string;
}

const memoryStore = new Map<string, TheoryNodeProgress>();
let dbUnavailable = false;
let warnedOnce = false;

function warnFallback(error: unknown) {
  dbUnavailable = true;
  if (!warnedOnce) {
    warnedOnce = true;
    console.warn(
      "[theory-map-progress] SQLite indisponível (modo web sem Tauri?) — progresso só em memória nesta sessão.",
      error
    );
  }
}

function rowToProgress(row: TheoryRow): TheoryNodeProgress {
  return {
    nodeId: row.node_id,
    status: row.status as TheoryNodeProgress["status"],
    updatedAt: row.updated_at,
  };
}

/** Nós com status registrado (os demais são 'nao_iniciado' por ausência). */
export async function getTheoryMapProgress(): Promise<TheoryNodeProgress[]> {
  if (dbUnavailable) return [...memoryStore.values()];
  try {
    const db = await initDb();
    const rows = await db.select<TheoryRow[]>("SELECT * FROM theory_map_progress");
    return rows.map(rowToProgress);
  } catch (error) {
    warnFallback(error);
    return [...memoryStore.values()];
  }
}

function applyInMemory(nodeId: string, requested: TheoryNodeStatus, origin: TheoryStatusOrigin) {
  const current = memoryStore.get(nodeId)?.status ?? "nao_iniciado";
  const resolved = resolveTheoryStatus(current, requested, origin);
  if (resolved === current) return;
  if (resolved === "nao_iniciado") {
    memoryStore.delete(nodeId);
    return;
  }
  memoryStore.set(nodeId, { nodeId, status: resolved, updatedAt: new Date().toISOString() });
}

/** Aplica a regra manual/auto sobre o status atual do nó e persiste o resultado. */
export async function setTheoryNodeStatus(
  nodeId: string,
  requested: TheoryNodeStatus,
  origin: TheoryStatusOrigin
): Promise<void> {
  if (dbUnavailable) {
    applyInMemory(nodeId, requested, origin);
    return;
  }
  try {
    const db = await initDb();
    const rows = await db.select<TheoryRow[]>(
      "SELECT * FROM theory_map_progress WHERE node_id = $1",
      [nodeId]
    );
    const current = rows[0] ? (rows[0].status as TheoryNodeStatus) : "nao_iniciado";
    const resolved = resolveTheoryStatus(current, requested, origin);
    if (resolved === current) return; // no-op (ex.: auto tentando rebaixar)
    if (resolved === "nao_iniciado") {
      await db.execute("DELETE FROM theory_map_progress WHERE node_id = $1", [nodeId]);
      return;
    }
    await db.execute(
      `INSERT OR REPLACE INTO theory_map_progress (node_id, status, updated_at)
       VALUES ($1, $2, $3)`,
      [nodeId, resolved, new Date().toISOString()]
    );
  } catch (error) {
    warnFallback(error);
    applyInMemory(nodeId, requested, origin);
  }
}

/** Só para testes: reseta o estado do fallback em memória. */
export function _resetTheoryMapFallback() {
  memoryStore.clear();
  dbUnavailable = false;
  warnedOnce = false;
}
