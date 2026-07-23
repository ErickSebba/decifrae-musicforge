import { useEffect, useState } from "react";
import type { ContentEntry } from "../engine/theory-engine";
import { getContentEntries, updateContentEntryReview } from "../db/content-entries";

/**
 * Central de Conteúdo — tela de revisão (3.4, UI pura sobre o CRUD da 3+5.0).
 *
 * ENQUADRAMENTO (decisão do usuário): ferramenta de revisão de PROPÓSITO GERAL, não
 * fila de verificação de conteúdo gerado. As 12 entradas atuais são de autoria do
 * próprio usuário (nascem 'confirmado' — ele marca erro se encontrar depois); conteúdo
 * realmente gerado pelo app, quando existir, nascerá 'nao_revisado' e passa pelo mesmo
 * fluxo. Os três status valem nos dois casos.
 *
 * O detalhe exibe o BODY PERSISTIDO (o que está no banco), não as seções tipadas do
 * seed — a Central revisa o dado que o status qualifica; a renderização estruturada
 * é papel da tela do Módulo 2. Sem parser/markdown (regra da 2.4).
 */

type ReviewStatus = ContentEntry["reviewStatus"];

const REVIEW_STATUS_LABELS: Record<ReviewStatus, string> = {
  nao_revisado: "Não revisado",
  confirmado: "Confirmado",
  contem_erro: "Contém erro",
};

const STATUS_OPTIONS: ReviewStatus[] = ["nao_revisado", "confirmado", "contem_erro"];

const STATUS_COLORS: Record<ReviewStatus, string> = {
  nao_revisado: "var(--color-text-dim)",
  confirmado: "var(--color-accent-teal)",
  contem_erro: "var(--color-accent-pink)",
};

function StatusChip({ status }: { status: ReviewStatus }) {
  return (
    <span
      className="text-xs px-2 py-0.5 rounded-full shrink-0"
      style={{
        color: STATUS_COLORS[status],
        border: `1px solid ${STATUS_COLORS[status]}`,
      }}
    >
      {REVIEW_STATUS_LABELS[status]}
    </span>
  );
}

export function ContentReviewCenter() {
  const [entries, setEntries] = useState<ContentEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Estado de edição LOCAL da entrada selecionada (trocar seleção descarta edição não salva).
  const [editStatus, setEditStatus] = useState<ReviewStatus>("nao_revisado");
  const [editNote, setEditNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<"saved" | "error" | null>(null);

  // Carga única com guard de corrida (padrão TheoryAndScales): resposta atrasada de um
  // mount antigo não sobrescreve o estado atual (StrictMode monta 2× em dev).
  useEffect(() => {
    let cancelled = false;
    void getContentEntries().then((result) => {
      if (cancelled) return;
      setEntries(result);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const selected = entries.find((e) => e.id === selectedId) ?? null;
  const dirty =
    selected !== null && (editStatus !== selected.reviewStatus || editNote !== selected.note);

  const select = (entry: ContentEntry) => {
    setSelectedId(entry.id);
    setEditStatus(entry.reviewStatus);
    setEditNote(entry.note);
    setFeedback(null); // edição/seleção nova limpa o "Salvo"
  };

  const save = async () => {
    if (!selected || !dirty || saving) return;
    setSaving(true);
    try {
      await updateContentEntryReview(selected.id, editStatus, editNote);
      // Atualiza a lista local (sem re-fetch) — chip e estado "sujo" refletem na hora.
      setEntries((current) =>
        current.map((e) =>
          e.id === selected.id ? { ...e, reviewStatus: editStatus, note: editNote } : e
        )
      );
      setFeedback("saved");
    } catch {
      setFeedback("error");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Tudo que o app registrou de teoria fica aqui pra revisão: marque o que você já
        conferiu como correto, anote erros que encontrar, e acompanhe o que ainda não
        foi revisado.
      </p>

      <div className="flex gap-6 items-start">
        {/* Lista (master) */}
        <nav aria-label="Entradas de conteúdo" className="flex flex-col gap-1 w-72 shrink-0">
          {loaded && entries.length === 0 && (
            <span className="text-sm" style={{ color: "var(--color-text-dim)" }}>
              Nenhum conteúdo registrado.
            </span>
          )}
          {entries.map((entry) => {
            const isSelected = entry.id === selectedId;
            return (
              <button
                key={entry.id}
                onClick={(e) => {
                  e.currentTarget.blur();
                  select(entry);
                }}
                className="flex items-center justify-between gap-2 px-3 py-2 text-sm text-left rounded-md"
                style={{
                  background: isSelected ? "var(--color-bg-card)" : "transparent",
                  color: isSelected ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  border: `1px solid ${isSelected ? "var(--color-border)" : "transparent"}`,
                }}
              >
                <span className="truncate">{entry.title}</span>
                <StatusChip status={entry.reviewStatus} />
              </button>
            );
          })}
        </nav>

        {/* Detalhe */}
        {selected ? (
          <article
            className="flex-1 flex flex-col gap-4 rounded-lg p-5"
            style={{ background: "var(--color-bg-card)" }}
          >
            <header className="flex flex-col gap-1">
              <h4
                className="text-lg font-semibold"
                style={{ color: "var(--color-text-primary)" }}
              >
                {selected.title}
              </h4>
              <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                topic: {selected.topic}
              </span>
            </header>

            {/* Body PERSISTIDO, cru (pre-wrap) — é o dado que a revisão qualifica. */}
            <div
              className="text-sm whitespace-pre-wrap rounded-md p-4"
              style={{
                color: "var(--color-text-muted)",
                background: "var(--color-bg-primary)",
                border: "1px solid var(--color-border)",
              }}
            >
              {selected.body}
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="text-xs uppercase tracking-widest"
                  style={{ color: "var(--color-text-dim)" }}
                >
                  Revisão
                </span>
                {STATUS_OPTIONS.map((status) => (
                  <button
                    key={status}
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setEditStatus(status);
                      setFeedback(null);
                    }}
                    className="px-2.5 py-1 text-sm font-medium rounded-md"
                    style={{
                      background:
                        editStatus === status
                          ? "var(--color-accent-purple)"
                          : "var(--color-bg-primary)",
                      color: editStatus === status ? "#fff" : STATUS_COLORS[status],
                      border: "1px solid var(--color-border)",
                    }}
                  >
                    {REVIEW_STATUS_LABELS[status]}
                  </button>
                ))}
              </div>

              <label
                className="flex flex-col gap-1 text-sm"
                style={{ color: "var(--color-text-muted)" }}
              >
                Observação
                <textarea
                  value={editNote}
                  onChange={(e) => {
                    setEditNote(e.target.value);
                    setFeedback(null);
                  }}
                  rows={3}
                  placeholder="Anotação livre da revisão (ex.: onde está o erro, fonte consultada…)"
                  className="rounded-md px-3 py-2 resize-y"
                  style={{
                    background: "var(--color-bg-primary)",
                    color: "var(--color-text-primary)",
                    border: "1px solid var(--color-border)",
                  }}
                />
              </label>

              <div className="flex items-center gap-3">
                <button
                  onClick={(e) => {
                    e.currentTarget.blur();
                    void save();
                  }}
                  disabled={!dirty || saving}
                  className="px-4 py-2 text-sm font-medium rounded-md"
                  style={{
                    background: dirty && !saving ? "var(--color-accent-purple)" : "var(--color-bg-primary)",
                    color: dirty && !saving ? "#fff" : "var(--color-text-dim)",
                    border: "1px solid var(--color-border)",
                    cursor: dirty && !saving ? "pointer" : "not-allowed",
                  }}
                >
                  Salvar
                </button>
                {feedback === "saved" && (
                  <span className="text-sm" style={{ color: "var(--color-accent-teal)" }}>
                    Salvo ✓
                  </span>
                )}
                {feedback === "error" && (
                  <span className="text-sm" style={{ color: "var(--color-accent-pink)" }}>
                    Erro ao salvar — tente de novo.
                  </span>
                )}
              </div>
            </div>
          </article>
        ) : (
          <div
            className="flex-1 rounded-lg p-8 text-sm text-center"
            style={{ background: "var(--color-bg-card)", color: "var(--color-text-dim)" }}
          >
            Selecione uma entrada pra ver o conteúdo e registrar a revisão.
          </div>
        )}
      </div>
    </div>
  );
}
