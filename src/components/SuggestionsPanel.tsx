import { useEffect, useMemo, useState } from "react";
import { CURATED_LEVELS } from "../engine/levels";
import {
  filterDismissed,
  resolveSuggestionTarget,
  suggestPractice,
  suggestionKey,
  type PracticeSuggestion,
} from "../engine/practice-suggestion";
import {
  getExerciseProgress,
  type ExerciseProgressRecord,
} from "../db/exercise-progress";
import { getExercises, getSessions, type Exercise, type PracticeSession } from "../db/practice-diary";
import { useAppStore } from "../store/useAppStore";

/**
 * Sugestão adaptativa (5b) — painel COMPARTILHADO (Diário + aba Exercícios do Progresso;
 * um componente, não duplica UI). UI pura sobre `suggestPractice` (engine já testada) e
 * os módulos de acesso. Roteamento do clique cai do `source` (app → Tab do Módulo 1 no
 * nível certo; diary → registrar sessão pré-preenchido) via `resolveSuggestionTarget` +
 * intenções one-shot na store. Dispensa em memória de sessão (store).
 */

const LIMIT = 5;

/** Nome legível: app → CURATED_LEVELS (órfão = id cru, igual 3.1); diary → label já é o nome. */
function resolveLabel(s: PracticeSuggestion): string {
  if (s.source === "app") {
    return CURATED_LEVELS.find((l) => l.id === s.id)?.name ?? s.id;
  }
  return s.label;
}

export function SuggestionsPanel() {
  const [progress, setProgress] = useState<ExerciseProgressRecord[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  const setActiveModule = useAppStore((s) => s.setActiveModule);
  const setReadingTarget = useAppStore((s) => s.setReadingTarget);
  const setDiaryPrefillExerciseId = useAppStore((s) => s.setDiaryPrefillExerciseId);
  const dismissedSuggestions = useAppStore((s) => s.dismissedSuggestions);
  const dismissSuggestion = useAppStore((s) => s.dismissSuggestion);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getExerciseProgress(), getExercises(true), getSessions()]).then(
      ([progressResult, exercisesResult, sessionsResult]) => {
        if (cancelled) return;
        setProgress(progressResult);
        setExercises(exercisesResult);
        setSessions(sessionsResult);
        setLoaded(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo(() => {
    const input = {
      appProgress: progress, // ExerciseProgressRecord encaixa em AppExerciseInput por forma
      exercises, // Exercise → DiaryExerciseInput
      sessions, // PracticeSession → DiarySessionInput
    };
    const ranked = suggestPractice(input, new Date(), LIMIT * 3);
    return filterDismissed(ranked, dismissedSuggestions).slice(0, LIMIT);
  }, [progress, exercises, sessions, dismissedSuggestions]);

  if (!loaded) return null;

  const act = (s: PracticeSuggestion) => {
    const target = resolveSuggestionTarget(s);
    if (target.type === "log-diary") {
      setDiaryPrefillExerciseId(target.exerciseId);
      setActiveModule("practice");
    } else {
      setReadingTarget({ mode: target.mode, levelId: target.levelId });
      setActiveModule("reading");
    }
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-lg p-4"
      style={{ background: "var(--color-bg-card)" }}
      aria-label="Sugestões de prática"
    >
      <h3 className="text-sm font-semibold uppercase tracking-widest" style={{ color: "var(--color-text-dim)" }}>
        Sugestão de prática
      </h3>

      {suggestions.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          Nada a sugerir agora — cadastre ou pratique exercícios e volte aqui.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {suggestions.map((s) => (
            <li
              key={suggestionKey(s)}
              className="flex items-start justify-between gap-3 rounded-md p-3"
              style={{ background: "var(--color-bg-primary)", border: "1px solid var(--color-border)" }}
            >
              <div className="flex flex-col gap-1 min-w-0">
                <span className="font-medium" style={{ color: "var(--color-text-primary)" }}>
                  {resolveLabel(s)}
                  <span
                    className="ml-2 text-xs px-1.5 py-0.5 rounded-full align-middle"
                    style={{ color: "var(--color-text-dim)", border: "1px solid var(--color-border)" }}
                  >
                    {s.source === "app" ? "no app" : "no baixo"}
                  </span>
                </span>
                {s.reasons.length > 0 && (
                  <span className="text-xs" style={{ color: "var(--color-text-muted)" }}>
                    {s.reasons.join(" · ")}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    act(s);
                  }}
                  className="text-xs px-3 py-1.5 rounded-md font-medium"
                  style={{ background: "var(--color-accent-purple)", color: "#fff" }}
                >
                  {s.source === "app" ? "Praticar" : "Registrar sessão"}
                </button>
                <button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    dismissSuggestion(suggestionKey(s));
                  }}
                  aria-label={`Dispensar ${resolveLabel(s)}`}
                  className="text-xs px-2 py-1.5 rounded-md"
                  style={{ color: "var(--color-text-dim)", border: "1px solid var(--color-border)" }}
                >
                  Dispensar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
