import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CURATED_LEVELS } from "../engine/levels";
import {
  buildHeatmapWeeks,
  classifyExercise,
  mergePracticeDayCounts,
} from "../engine/progress-stats";
import {
  averageRatio,
  getExerciseProgress,
  getPracticeDays,
  localDayString,
  type ExerciseProgressRecord,
  type PracticeDayRecord,
} from "../db/exercise-progress";
import { getSessions, type PracticeSession } from "../db/practice-diary";

/**
 * Aba "Exercícios" da página Progresso (3.1). Lê SÓ o que existe (agregado + contagem
 * por dia — seção 12.2 do brief: NÃO há curva de evolução por tentativa, não inventar):
 * stats compactos, tabela por exercício, BarChart Melhor×Média (estreia do Recharts,
 * série validada pelo validador da skill dataviz contra o card escuro) e heatmap de
 * calendário de 12 semanas (grade própria — calendário não é forma nativa do Recharts).
 *
 * Heatmap = merge de DUAS fontes disjuntas por construção (3+5.0): practice_days
 * (exercícios do app) + practice_sessions.practiced_on (diário M5) — soma direta.
 * "Distribuição por kind" ficou FORA por decisão: com um único kind persistindo ('tap'),
 * o gráfico é degenerado; volta quando timed/dictation persistirem.
 */

const HEATMAP_WEEKS = 12;
/** Degraus de intensidade (percentual do token accent via color-mix): 0, 1, 2–3, 4+. */
const HEAT_STEPS = [0, 35, 65, 100] as const;

function heatStep(count: number): number {
  if (count <= 0) return HEAT_STEPS[0];
  if (count === 1) return HEAT_STEPS[1];
  if (count <= 3) return HEAT_STEPS[2];
  return HEAT_STEPS[3];
}

const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

interface Row {
  record: ExerciseProgressRecord;
  /** Nome legível do catálogo; id cru quando órfão (nunca ocultar tentativas reais). */
  label: string;
  orphan: boolean;
  passThreshold: number | null;
  stagnant: boolean;
  stale: boolean;
}

function buildRows(records: ExerciseProgressRecord[], today: Date): Row[] {
  const levelOrder = new Map(CURATED_LEVELS.map((l, i) => [l.id, i]));
  return records
    .map((record) => {
      // Rótulos vêm do catálogo do kind; hoje só o Tap tem catálogo (CURATED_LEVELS).
      const level =
        record.kind === "tap" ? CURATED_LEVELS.find((l) => l.id === record.exerciseId) : undefined;
      const orphan = record.kind === "tap" && !level;
      const badges = classifyExercise(
        {
          passed: record.passed,
          attemptsCount: record.attemptsCount,
          lastAttemptedAt: record.lastAttemptedAt,
          orphan,
        },
        today
      );
      return {
        record,
        label: level?.name ?? record.exerciseId,
        orphan,
        passThreshold: level?.passThreshold ?? null,
        stagnant: badges.stagnant,
        stale: badges.stale,
      };
    })
    .sort((a, b) => {
      const ia = levelOrder.get(a.record.exerciseId) ?? Number.MAX_SAFE_INTEGER;
      const ib = levelOrder.get(b.record.exerciseId) ?? Number.MAX_SAFE_INTEGER;
      return ia - ib || a.record.exerciseId.localeCompare(b.record.exerciseId);
    });
}

const pct = (ratio: number) => Math.round(ratio * 100);

export function ExerciseProgressPanel() {
  const [records, setRecords] = useState<ExerciseProgressRecord[]>([]);
  const [days, setDays] = useState<PracticeDayRecord[]>([]);
  const [sessions, setSessions] = useState<PracticeSession[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Carga única das 3 fontes com guard de corrida (padrão do marco).
  useEffect(() => {
    let cancelled = false;
    void Promise.all([getExerciseProgress(), getPracticeDays(), getSessions()]).then(
      ([progressResult, daysResult, sessionsResult]) => {
        if (cancelled) return;
        setRecords(progressResult);
        setDays(daysResult);
        setSessions(sessionsResult);
        setLoaded(true);
      }
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const today = useMemo(() => new Date(), []);
  const rows = useMemo(() => buildRows(records, today), [records, today]);
  const dayCounts = useMemo(() => mergePracticeDayCounts(days, sessions), [days, sessions]);
  const weeks = useMemo(() => buildHeatmapWeeks(today, HEATMAP_WEEKS), [today]);
  const todayKey = localDayString(today);

  const chartData = rows.map((row) => ({
    name: row.label,
    melhor: pct(row.record.bestRatio),
    media: (() => {
      const avg = averageRatio(row.record);
      return avg === null ? null : pct(avg);
    })(),
  }));

  // Linha de referência só quando TODOS os níveis presentes compartilham o threshold
  // (hoje: 0.8 uniforme). Thresholds mistos → sem linha (uma linha só mentiria).
  const thresholds = new Set(rows.map((r) => r.passThreshold).filter((t) => t !== null));
  const referencePct = thresholds.size === 1 ? pct([...thresholds][0]!) : null;

  const totalAttempts = rows.reduce((sum, r) => sum + r.record.attemptsCount, 0);
  const activeDays = [...dayCounts.values()].filter((n) => n > 0).length;

  if (!loaded) return null;

  return (
    <div className="flex flex-col gap-6">
      {/* Stats compactos (a "distribuição por kind" volta quando houver mais de um kind). */}
      <dl className="flex gap-8 text-sm" style={{ color: "var(--color-text-muted)" }}>
        {[
          { label: "Exercícios praticados", value: rows.length },
          { label: "Tentativas totais", value: totalAttempts },
          { label: "Dias com prática", value: activeDays },
        ].map((stat) => (
          <div key={stat.label}>
            <dt
              className="text-xs uppercase tracking-widest"
              style={{ color: "var(--color-text-dim)" }}
            >
              {stat.label}
            </dt>
            <dd className="text-xl font-semibold" style={{ color: "var(--color-text-primary)" }}>
              {stat.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* Tabela por exercício */}
      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Por exercício
        </h3>
        {rows.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
            Nenhum exercício praticado ainda — jogue os níveis do Tap no módulo Leitura e
            Ritmo e o progresso aparece aqui.
          </p>
        ) : (
          <div
            className="rounded-lg overflow-x-auto"
            style={{ background: "var(--color-bg-card)" }}
          >
            <table className="w-full text-sm" style={{ color: "var(--color-text-muted)" }}>
              <thead>
                <tr
                  className="text-xs uppercase tracking-wider text-left"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  <th className="px-4 py-3 font-medium">Exercício</th>
                  <th className="px-4 py-3 font-medium">Melhor</th>
                  <th className="px-4 py-3 font-medium">Média</th>
                  <th className="px-4 py-3 font-medium">Tentativas</th>
                  <th className="px-4 py-3 font-medium">Aprovado</th>
                  <th className="px-4 py-3 font-medium">Última prática</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const avg = averageRatio(row.record);
                  return (
                    <tr
                      key={`${row.record.kind}:${row.record.exerciseId}`}
                      style={{ borderTop: "1px solid var(--color-border)" }}
                    >
                      <td className="px-4 py-2.5">
                        <span
                          style={{
                            color: row.orphan
                              ? "var(--color-text-dim)"
                              : "var(--color-text-primary)",
                          }}
                        >
                          {row.label}
                        </span>
                        {row.stagnant && (
                          <span
                            className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                            style={{
                              color: "var(--color-accent-pink)",
                              border: "1px solid var(--color-accent-pink)",
                            }}
                          >
                            estagnado
                          </span>
                        )}
                        {row.stale && (
                          <span
                            className="ml-2 text-xs px-1.5 py-0.5 rounded-full"
                            style={{
                              color: "var(--color-text-dim)",
                              border: "1px solid var(--color-text-dim)",
                            }}
                          >
                            parado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2.5">{pct(row.record.bestRatio)}%</td>
                      <td className="px-4 py-2.5">{avg === null ? "—" : `${pct(avg)}%`}</td>
                      <td className="px-4 py-2.5">{row.record.attemptsCount}</td>
                      <td className="px-4 py-2.5">
                        {row.record.passed ? (
                          <span style={{ color: "var(--color-accent-teal)" }}>✓</span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-2.5">
                        {new Date(row.record.lastAttemptedAt).toLocaleDateString("pt-BR")}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* BarChart Melhor × Média (estreia do Recharts; some sem dados) */}
      {rows.length > 0 && (
        <section className="flex flex-col gap-3">
          <h3 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
            Melhor × Média por exercício
          </h3>
          <div
            className="rounded-lg p-4"
            style={{ background: "var(--color-bg-card)" }}
            data-testid="progress-chart"
          >
            <ResponsiveContainer width="100%" height={rows.length * 56 + 60}>
              <BarChart data={chartData} layout="vertical" barGap={2}>
                <CartesianGrid
                  horizontal={false}
                  stroke="var(--color-border)"
                  strokeDasharray="2 4"
                />
                <XAxis
                  type="number"
                  domain={[0, 100]}
                  unit="%"
                  stroke="var(--color-text-dim)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={150}
                  stroke="var(--color-text-muted)"
                  tickLine={false}
                  axisLine={false}
                  fontSize={12}
                />
                <Tooltip
                  cursor={{ fill: "rgba(124, 58, 237, 0.08)" }}
                  contentStyle={{
                    background: "var(--color-bg-primary)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "var(--radius-btn)",
                    color: "var(--color-text-primary)",
                    fontSize: 12,
                  }}
                  formatter={(value, name) => [
                    value == null ? "—" : `${String(value)}%`,
                    name === "melhor" ? "Melhor" : "Média",
                  ]}
                />
                <Legend
                  formatter={(value: string) => (
                    <span style={{ color: "var(--color-text-muted)", fontSize: 12 }}>
                      {value === "melhor" ? "Melhor" : "Média"}
                    </span>
                  )}
                />
                {referencePct !== null && (
                  <ReferenceLine
                    x={referencePct}
                    stroke="var(--color-text-dim)"
                    strokeDasharray="4 4"
                  />
                )}
                {/* Série validada (validate_palette: purple-light + teal vs card escuro, ALL PASS) */}
                <Bar dataKey="melhor" fill="var(--color-accent-purple-light)" barSize={12} radius={[0, 4, 4, 0]} />
                <Bar dataKey="media" fill="var(--color-accent-teal)" barSize={12} radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* Heatmap de frequência (12 semanas, dia LOCAL, merge app+diário) */}
      <section className="flex flex-col gap-3">
        <h3 className="text-lg font-semibold" style={{ color: "var(--color-text-primary)" }}>
          Frequência de prática
        </h3>
        <div
          className="rounded-lg p-4 flex flex-col gap-2 overflow-x-auto"
          style={{ background: "var(--color-bg-card)" }}
        >
          <div className="flex gap-1" data-testid="heatmap">
            <div className="flex flex-col gap-1 mr-1" aria-hidden>
              {WEEKDAY_LABELS.map((label, i) => (
                <span
                  key={label}
                  className="text-[9px] leading-none h-3 flex items-center"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  {i % 2 === 1 ? label : ""}
                </span>
              ))}
            </div>
            {weeks.map((week, w) => (
              <div key={w} className="flex flex-col gap-1">
                {week.map((date) => {
                  const key = localDayString(date);
                  const future = key > todayKey;
                  const count = dayCounts.get(key) ?? 0;
                  const step = heatStep(count);
                  return (
                    <div
                      key={key}
                      title={future ? undefined : `${key}: ${count} prática${count === 1 ? "" : "s"}`}
                      data-day={future ? undefined : key}
                      data-count={future ? undefined : count}
                      className="w-3 h-3 rounded-[2px]"
                      style={{
                        visibility: future ? "hidden" : "visible",
                        background:
                          step === 0
                            ? "var(--color-bg-primary)"
                            : `color-mix(in srgb, var(--color-accent-purple) ${step}%, var(--color-bg-primary))`,
                        border: "1px solid var(--color-border)",
                      }}
                    />
                  );
                })}
              </div>
            ))}
          </div>
          <div
            className="flex items-center gap-1.5 text-xs self-end"
            style={{ color: "var(--color-text-dim)" }}
          >
            menos
            {HEAT_STEPS.map((step) => (
              <span
                key={step}
                className="w-3 h-3 rounded-[2px] inline-block"
                style={{
                  background:
                    step === 0
                      ? "var(--color-bg-primary)"
                      : `color-mix(in srgb, var(--color-accent-purple) ${step}%, var(--color-bg-primary))`,
                  border: "1px solid var(--color-border)",
                }}
              />
            ))}
            mais
          </div>
          {activeDays === 0 && (
            <span className="text-sm" style={{ color: "var(--color-text-dim)" }}>
              Nenhuma prática registrada ainda — os dias vão acender conforme você pratica.
            </span>
          )}
        </div>
      </section>
    </div>
  );
}
