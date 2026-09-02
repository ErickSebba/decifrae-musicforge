import { useEffect, useMemo, useState } from "react";
import {
  COMPLEXITY_MAX,
  COMPLEXITY_MIN,
  RATING_MAX,
  addSession,
  archiveExercise,
  createExercise,
  deleteSession,
  getExercises,
  getSessions,
  updateExercise,
  type Exercise,
  type PracticeSession,
} from "../db/practice-diary";
import { localDayString } from "../db/exercise-progress";
import { groupSessionsByExercise, summarizeSessions } from "../engine/diary-stats";

/**
 * Diário de Prática (5a) — página própria do Módulo 5. Cadastro de exercícios do usuário
 * e registro de sessões reais no instrumento. UI sobre o CRUD do practice-diary (regras
 * de negócio em JS lá; aqui a UI filtra o caminho feliz e o try/catch é a rede de
 * segurança). Agregados por card = DERIVADOS das sessões na leitura (diary-stats), nunca
 * tabela paralela. `reload()` re-busca após cada mutação (fonte = banco, volume pequeno).
 */

const EMPTY_EXERCISE = { name: "", category: "", complexity: 3, targetBpm: "" };
type ExerciseDraft = typeof EMPTY_EXERCISE;

const EMPTY_SESSION = {
  exerciseId: "",
  practicedOn: "",
  bpm: "",
  durationMin: "",
  rating: null as number | null,
  note: "",
};
type SessionDraft = typeof EMPTY_SESSION;

/** String de input numérico → number|null (vazio vira NULL, nunca 0). */
function numOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

function Stars({
  value,
  onChange,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Autoavaliação">
      {Array.from({ length: RATING_MAX }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} estrela${star > 1 ? "s" : ""}`}
          aria-pressed={value != null && star <= value}
          onClick={(e) => {
            e.currentTarget.blur();
            onChange(star);
          }}
          className="text-lg leading-none"
          style={{
            color:
              value != null && star <= value
                ? "var(--color-accent-purple-light)"
                : "var(--color-text-dim)",
          }}
        >
          ★
        </button>
      ))}
      {value != null && (
        <button
          type="button"
          onClick={(e) => {
            e.currentTarget.blur();
            onChange(null);
          }}
          className="text-xs ml-1"
          style={{ color: "var(--color-text-dim)" }}
        >
          limpar
        </button>
      )}
    </div>
  );
}

const inputStyle = {
  background: "var(--color-bg-primary)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border)",
} as const;

function fmtRating(rating: number | null): string {
  return rating == null ? "—" : `${rating}/${RATING_MAX}`;
}

export function PracticeDiaryPanel() {
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  // Forms
  const [exerciseDraft, setExerciseDraft] = useState<ExerciseDraft | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [exerciseError, setExerciseError] = useState("");
  const [sessionDraft, setSessionDraft] = useState<SessionDraft>(EMPTY_SESSION);
  const [sessionError, setSessionError] = useState("");
  const [saving, setSaving] = useState(false);
  const [filterExerciseId, setFilterExerciseId] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // includeArchived sempre true no fetch — filtramos em JS conforme o toggle, pra um
  // fetch só alimentar tanto a lista quanto o resumo agregado.
  const reload = async () => {
    const [ex, se] = await Promise.all([getExercises(true), getSessions()]);
    setExercises(ex);
    setSessions(se);
  };

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getExercises(true), getSessions()]).then(([ex, se]) => {
      if (cancelled) return;
      setExercises(ex);
      setSessions(se);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const activeExercises = useMemo(() => exercises.filter((e) => !e.archived), [exercises]);
  const visibleExercises = showArchived ? exercises : activeExercises;
  const sessionsByExercise = useMemo(() => groupSessionsByExercise(sessions), [sessions]);
  const exerciseName = useMemo(
    () => new Map(exercises.map((e) => [e.id, e.name])),
    [exercises]
  );

  const visibleSessions = filterExerciseId
    ? sessions.filter((s) => s.exerciseId === filterExerciseId)
    : sessions;

  const openNewExercise = () => {
    setEditingId(null);
    setExerciseError("");
    setExerciseDraft({ ...EMPTY_EXERCISE });
  };

  const openEditExercise = (ex: Exercise) => {
    setEditingId(ex.id);
    setExerciseError("");
    setExerciseDraft({
      name: ex.name,
      category: ex.category,
      complexity: ex.complexity,
      targetBpm: ex.targetBpm == null ? "" : String(ex.targetBpm),
    });
  };

  const submitExercise = async () => {
    if (!exerciseDraft || saving) return;
    setSaving(true);
    setExerciseError("");
    try {
      const input = {
        name: exerciseDraft.name,
        category: exerciseDraft.category,
        complexity: exerciseDraft.complexity,
        targetBpm: numOrNull(exerciseDraft.targetBpm),
      };
      if (editingId) await updateExercise(editingId, input);
      else await createExercise(input);
      await reload();
      setExerciseDraft(null);
      setEditingId(null);
    } catch (err) {
      setExerciseError(err instanceof Error ? err.message : "Erro ao salvar exercício");
    } finally {
      setSaving(false);
    }
  };

  const archive = async (id: string) => {
    try {
      await archiveExercise(id);
      await reload();
    } catch {
      /* arquivar id válido não lança; ignorável */
    }
  };

  const submitSession = async () => {
    if (saving) return;
    setSaving(true);
    setSessionError("");
    try {
      await addSession({
        exerciseId: sessionDraft.exerciseId,
        practicedOn: sessionDraft.practicedOn || undefined,
        bpm: numOrNull(sessionDraft.bpm),
        durationMin: numOrNull(sessionDraft.durationMin),
        rating: sessionDraft.rating,
        note: sessionDraft.note,
      });
      await reload();
      setSessionDraft({ ...EMPTY_SESSION });
    } catch (err) {
      setSessionError(err instanceof Error ? err.message : "Erro ao registrar sessão");
    } finally {
      setSaving(false);
    }
  };

  const removeSession = async (id: string) => {
    setConfirmDeleteId(null);
    await deleteSession(id);
    await reload();
  };

  if (!loaded) return null;

  const noExercises = exercises.length === 0;

  return (
    <div className="flex flex-col gap-8">
      {/* ————— Exercícios ————— */}
      <section className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Exercícios
          </h3>
          <div className="flex items-center gap-3">
            {exercises.some((e) => e.archived) && (
              <label
                className="flex items-center gap-1.5 text-xs"
                style={{ color: "var(--color-text-muted)" }}
              >
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                />
                Mostrar arquivados
              </label>
            )}
            <button
              onClick={(e) => {
                e.currentTarget.blur();
                openNewExercise();
              }}
              className="px-3 py-1.5 text-sm font-medium rounded-md"
              style={{ background: "var(--color-accent-purple)", color: "#fff" }}
            >
              Novo exercício
            </button>
          </div>
        </div>

        {noExercises && !exerciseDraft && (
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Cadastre seu primeiro exercício pra começar a registrar as práticas no baixo.
          </p>
        )}

        {/* Form inline de exercício (novo/edição) */}
        {exerciseDraft && (
          <div
            className="rounded-lg p-4 flex flex-col gap-3"
            style={{ background: "var(--color-bg-card)" }}
          >
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm flex-1 min-w-40" style={{ color: "var(--color-text-muted)" }}>
                Nome
                <input
                  value={exerciseDraft.name}
                  onChange={(e) => setExerciseDraft({ ...exerciseDraft, name: e.target.value })}
                  className="rounded-md px-3 py-2"
                  style={inputStyle}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm flex-1 min-w-40" style={{ color: "var(--color-text-muted)" }}>
                Categoria
                <input
                  value={exerciseDraft.category}
                  onChange={(e) => setExerciseDraft({ ...exerciseDraft, category: e.target.value })}
                  placeholder="ex.: escalas, groove, leitura"
                  className="rounded-md px-3 py-2"
                  style={inputStyle}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                Complexidade ({COMPLEXITY_MIN}–{COMPLEXITY_MAX})
                <input
                  type="number"
                  min={COMPLEXITY_MIN}
                  max={COMPLEXITY_MAX}
                  value={exerciseDraft.complexity}
                  onChange={(e) =>
                    setExerciseDraft({ ...exerciseDraft, complexity: Number(e.target.value) })
                  }
                  className="rounded-md px-3 py-2 w-28"
                  style={inputStyle}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                BPM-alvo (opcional)
                <input
                  type="number"
                  value={exerciseDraft.targetBpm}
                  onChange={(e) => setExerciseDraft({ ...exerciseDraft, targetBpm: e.target.value })}
                  className="rounded-md px-3 py-2 w-28"
                  style={inputStyle}
                />
              </label>
            </div>
            {exerciseError && (
              <span className="text-sm" style={{ color: "var(--color-accent-pink)" }}>
                {exerciseError}
              </span>
            )}
            <div className="flex gap-2">
              <button
                onClick={(e) => {
                  e.currentTarget.blur();
                  void submitExercise();
                }}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium rounded-md"
                style={{ background: "var(--color-accent-purple)", color: "#fff" }}
              >
                {editingId ? "Salvar" : "Cadastrar"}
              </button>
              <button
                onClick={(e) => {
                  e.currentTarget.blur();
                  setExerciseDraft(null);
                  setEditingId(null);
                }}
                className="px-4 py-2 text-sm rounded-md"
                style={{ background: "var(--color-bg-primary)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
              >
                Cancelar
              </button>
            </div>
          </div>
        )}

        {/* Cards de exercício */}
        {visibleExercises.length > 0 && (
          <div className="flex flex-col gap-2">
            {visibleExercises.map((ex) => {
              const summary = summarizeSessions(sessionsByExercise.get(ex.id) ?? []);
              return (
                <div
                  key={ex.id}
                  className="rounded-lg p-4 flex flex-wrap items-start justify-between gap-3"
                  style={{
                    background: "var(--color-bg-card)",
                    opacity: ex.archived ? 0.55 : 1,
                  }}
                >
                  <div className="flex flex-col gap-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                        {ex.name}
                      </span>
                      {ex.archived && (
                        <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ color: "var(--color-text-dim)", border: "1px solid var(--color-text-dim)" }}>
                          arquivado
                        </span>
                      )}
                    </div>
                    <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                      {ex.category || "sem categoria"} · complexidade {ex.complexity}/{COMPLEXITY_MAX}
                      {ex.targetBpm != null && ` · alvo ${ex.targetBpm} BPM`}
                    </span>
                    <span className="text-xs mt-1" style={{ color: "var(--color-text-muted)" }}>
                      {summary.count === 0
                        ? "sem sessões registradas"
                        : `${summary.count} sessõe${summary.count > 1 ? "s" : ""}` +
                          (summary.maxBpm != null ? ` · recorde ${summary.maxBpm} BPM` : "") +
                          (summary.avgRatingRecent != null
                            ? ` · média recente ${summary.avgRatingRecent.toFixed(1)}/${RATING_MAX}`
                            : "") +
                          (summary.lastPracticedOn ? ` · última ${summary.lastPracticedOn}` : "")}
                    </span>
                  </div>
                  {!ex.archived && (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.currentTarget.blur();
                          openEditExercise(ex);
                        }}
                        className="text-xs px-2.5 py-1 rounded-md"
                        style={{ background: "var(--color-bg-primary)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
                      >
                        Editar
                      </button>
                      <button
                        onClick={(e) => {
                          e.currentTarget.blur();
                          void archive(ex.id);
                        }}
                        className="text-xs px-2.5 py-1 rounded-md"
                        style={{ background: "var(--color-bg-primary)", color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
                      >
                        Arquivar
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ————— Registrar sessão ————— */}
      <section className="flex flex-col gap-4">
        <h3 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Registrar sessão
        </h3>

        {activeExercises.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            {noExercises
              ? "Cadastre um exercício acima pra poder registrar sessões."
              : "Todos os exercícios estão arquivados — reative ou cadastre um novo pra registrar sessões."}
          </p>
        ) : (
          <div className="rounded-lg p-4 flex flex-col gap-3" style={{ background: "var(--color-bg-card)" }}>
            <div className="flex flex-wrap gap-3">
              <label className="flex flex-col gap-1 text-sm flex-1 min-w-48" style={{ color: "var(--color-text-muted)" }}>
                Exercício
                <select
                  value={sessionDraft.exerciseId}
                  onChange={(e) => setSessionDraft({ ...sessionDraft, exerciseId: e.target.value })}
                  className="rounded-md px-3 py-2"
                  style={inputStyle}
                >
                  <option value="">— escolha —</option>
                  {activeExercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                Data
                <input
                  type="date"
                  value={sessionDraft.practicedOn || localDayString(new Date())}
                  max={localDayString(new Date())}
                  onChange={(e) => setSessionDraft({ ...sessionDraft, practicedOn: e.target.value })}
                  className="rounded-md px-3 py-2"
                  style={inputStyle}
                />
              </label>
            </div>
            <div className="flex flex-wrap gap-3 items-end">
              <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                BPM (opcional)
                <input
                  type="number"
                  value={sessionDraft.bpm}
                  onChange={(e) => setSessionDraft({ ...sessionDraft, bpm: e.target.value })}
                  className="rounded-md px-3 py-2 w-28"
                  style={inputStyle}
                />
              </label>
              <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                Duração (min, opcional)
                <input
                  type="number"
                  value={sessionDraft.durationMin}
                  onChange={(e) => setSessionDraft({ ...sessionDraft, durationMin: e.target.value })}
                  className="rounded-md px-3 py-2 w-32"
                  style={inputStyle}
                />
              </label>
              <div className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
                Autoavaliação (opcional)
                <Stars
                  value={sessionDraft.rating}
                  onChange={(rating) => setSessionDraft({ ...sessionDraft, rating })}
                />
              </div>
            </div>
            <label className="flex flex-col gap-1 text-sm" style={{ color: "var(--color-text-muted)" }}>
              Observação
              <textarea
                value={sessionDraft.note}
                onChange={(e) => setSessionDraft({ ...sessionDraft, note: e.target.value })}
                rows={2}
                placeholder="como foi a prática, o que travou, o que melhorou…"
                className="rounded-md px-3 py-2 resize-y"
                style={inputStyle}
              />
            </label>
            {sessionError && (
              <span className="text-sm" style={{ color: "var(--color-accent-pink)" }}>
                {sessionError}
              </span>
            )}
            <div>
              <button
                onClick={(e) => {
                  e.currentTarget.blur();
                  void submitSession();
                }}
                disabled={saving || !sessionDraft.exerciseId}
                className="px-4 py-2 text-sm font-medium rounded-md"
                style={{
                  background:
                    saving || !sessionDraft.exerciseId
                      ? "var(--color-bg-primary)"
                      : "var(--color-accent-purple)",
                  color: saving || !sessionDraft.exerciseId ? "var(--color-text-dim)" : "#fff",
                  border: "1px solid var(--color-border)",
                  cursor: saving || !sessionDraft.exerciseId ? "not-allowed" : "pointer",
                }}
              >
                Registrar
              </button>
            </div>
          </div>
        )}

        {/* Listagem de sessões */}
        {sessions.length > 0 && (
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h4 className="text-sm font-semibold" style={{ color: "var(--color-text-primary)" }}>
                Sessões registradas
              </h4>
              <label className="flex items-center gap-2 text-xs" style={{ color: "var(--color-text-muted)" }}>
                Filtrar
                <select
                  value={filterExerciseId}
                  onChange={(e) => setFilterExerciseId(e.target.value)}
                  className="rounded-md px-2 py-1"
                  style={inputStyle}
                >
                  <option value="">todos</option>
                  {exercises.map((ex) => (
                    <option key={ex.id} value={ex.id}>
                      {ex.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="rounded-lg overflow-x-auto" style={{ background: "var(--color-bg-card)" }}>
              <table className="w-full text-sm" style={{ color: "var(--color-text-muted)" }}>
                <thead>
                  <tr className="text-xs uppercase tracking-wider text-left" style={{ color: "var(--color-text-dim)" }}>
                    <th className="px-4 py-3 font-medium">Data</th>
                    <th className="px-4 py-3 font-medium">Exercício</th>
                    <th className="px-4 py-3 font-medium">BPM</th>
                    <th className="px-4 py-3 font-medium">Duração</th>
                    <th className="px-4 py-3 font-medium">Avaliação</th>
                    <th className="px-4 py-3 font-medium">Observação</th>
                    <th className="px-4 py-3 font-medium" />
                  </tr>
                </thead>
                <tbody>
                  {visibleSessions.map((s) => (
                    <tr key={s.id} style={{ borderTop: "1px solid var(--color-border)" }}>
                      <td className="px-4 py-2.5">{s.practicedOn}</td>
                      <td className="px-4 py-2.5">{exerciseName.get(s.exerciseId) ?? s.exerciseId}</td>
                      <td className="px-4 py-2.5">{s.bpm ?? "—"}</td>
                      <td className="px-4 py-2.5">{s.durationMin == null ? "—" : `${s.durationMin} min`}</td>
                      <td className="px-4 py-2.5">{fmtRating(s.rating)}</td>
                      <td className="px-4 py-2.5 max-w-xs truncate" title={s.note}>
                        {s.note || "—"}
                      </td>
                      <td className="px-4 py-2.5 text-right">
                        {confirmDeleteId === s.id ? (
                          <span className="flex gap-2 justify-end items-center">
                            <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                              Excluir?
                            </span>
                            <button
                              onClick={(e) => {
                                e.currentTarget.blur();
                                void removeSession(s.id);
                              }}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{ color: "var(--color-accent-pink)", border: "1px solid var(--color-accent-pink)" }}
                            >
                              Sim
                            </button>
                            <button
                              onClick={(e) => {
                                e.currentTarget.blur();
                                setConfirmDeleteId(null);
                              }}
                              className="text-xs px-2 py-0.5 rounded"
                              style={{ color: "var(--color-text-muted)", border: "1px solid var(--color-border)" }}
                            >
                              Não
                            </button>
                          </span>
                        ) : (
                          <button
                            onClick={(e) => {
                              e.currentTarget.blur();
                              setConfirmDeleteId(s.id);
                            }}
                            className="text-xs px-2 py-0.5 rounded"
                            style={{ color: "var(--color-text-dim)", border: "1px solid var(--color-border)" }}
                          >
                            Excluir
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
