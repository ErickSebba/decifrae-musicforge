import { useEffect, useState } from "react";
import {
  addChapter,
  addExercise,
  createBook,
  deleteBook,
  getChapters,
  getExercises,
  getStudyBooks,
  importSyllabus,
  moveBook,
  moveChapter,
  moveExercise,
  removeChapter,
  removeExercise,
  renameChapter,
  renameExercise,
  setChapterOwnStatus,
  setExerciseStatus,
  updateBook,
  type StudyBook,
  type StudyChapter,
  type StudyExercise,
} from "../db/study-track";
import {
  deriveBookStatus,
  deriveChapterStatus,
  parseSyllabus,
  type StudyStatus,
} from "../engine/study-track";

/**
 * Trilha de estudo externa (3.2) — aba do Progresso. UI sobre o CRUD de study-track
 * (livros/capítulos/exercícios NO BANCO) e o parser de importação. Carrega TUDO no mount
 * (volume pequeno) pra computar os status DERIVADOS (capítulo/livro) e recarrega após
 * cada mutação (padrão dos módulos 5a/5b). Status por exercício e own_status de capítulo
 * sem exercícios são clicáveis (ciclo de 3 estados). A importação mostra preview antes de
 * confirmar e o resultado é sempre editável — rede de segurança pra qualquer classificação
 * errada do parser. Tokens do @theme, sem cor solta.
 */

const STATUS_LABELS: Record<StudyStatus, string> = {
  nao_iniciado: "Não iniciado",
  em_andamento: "Em andamento",
  concluido: "Concluído",
};
const STATUS_COLORS: Record<StudyStatus, string> = {
  nao_iniciado: "var(--color-text-dim)",
  em_andamento: "var(--color-accent-purple-light)",
  concluido: "var(--color-accent-teal)",
};
const STATUS_CYCLE: Record<StudyStatus, StudyStatus> = {
  nao_iniciado: "em_andamento",
  em_andamento: "concluido",
  concluido: "nao_iniciado",
};

function StatusPill({
  status,
  onClick,
}: {
  status: StudyStatus;
  onClick?: () => void;
}) {
  const label = STATUS_LABELS[status];
  const color = STATUS_COLORS[status];
  const style = { color, border: `1px solid ${color}` } as const;
  if (!onClick) {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full" style={style} title="Status derivado dos exercícios">
        {label}
      </span>
    );
  }
  return (
    <button
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
      className="text-xs px-2 py-0.5 rounded-full"
      style={{ ...style, cursor: "pointer" }}
      title="Clique para alternar o status"
    >
      {label}
    </button>
  );
}

const iconBtnStyle = {
  background: "var(--color-bg-primary)",
  color: "var(--color-text-muted)",
  border: "1px solid var(--color-border)",
} as const;

function IconBtn({
  label,
  onClick,
  title,
}: {
  label: string;
  onClick: () => void;
  title: string;
}) {
  return (
    <button
      onClick={(e) => {
        e.currentTarget.blur();
        onClick();
      }}
      title={title}
      className="text-xs px-2 py-0.5 rounded-md"
      style={iconBtnStyle}
    >
      {label}
    </button>
  );
}

const inputStyle = {
  background: "var(--color-bg-primary)",
  color: "var(--color-text-primary)",
  border: "1px solid var(--color-border)",
} as const;

/** Chave de edição inline (renomear) — um estado só pra livro/capítulo/exercício. */
type EditKey = string; // `b:${id}` | `c:${id}` | `e:${id}`

export function StudyTrackPanel() {
  const [books, setBooks] = useState<StudyBook[]>([]);
  const [chaptersByBook, setChaptersByBook] = useState<Map<string, StudyChapter[]>>(new Map());
  const [exercisesByChapter, setExercisesByChapter] = useState<Map<string, StudyExercise[]>>(
    new Map()
  );
  const [loaded, setLoaded] = useState(false);

  const [expandedBooks, setExpandedBooks] = useState<Set<string>>(new Set());
  const [expandedChapters, setExpandedChapters] = useState<Set<string>>(new Set());

  // Formulários / edição inline.
  const [newBookTitle, setNewBookTitle] = useState("");
  const [newBookAuthor, setNewBookAuthor] = useState("");
  const [editing, setEditing] = useState<{ key: EditKey; draft: string } | null>(null);
  const [chapterDraft, setChapterDraft] = useState<Record<string, string>>({}); // bookId → título novo
  const [exerciseDraft, setExerciseDraft] = useState<Record<string, string>>({}); // chapterId → label novo
  const [importText, setImportText] = useState<Record<string, string>>({}); // bookId → textarea
  const [importOpen, setImportOpen] = useState<Set<string>>(new Set());
  const [error, setError] = useState("");

  async function loadAll() {
    const bs = await getStudyBooks();
    const chByBook = new Map<string, StudyChapter[]>();
    const exByCh = new Map<string, StudyExercise[]>();
    for (const b of bs) {
      const chs = await getChapters(b.id);
      chByBook.set(b.id, chs);
      for (const ch of chs) exByCh.set(ch.id, await getExercises(ch.id));
    }
    setBooks(bs);
    setChaptersByBook(chByBook);
    setExercisesByChapter(exByCh);
  }

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const bs = await getStudyBooks();
      const chByBook = new Map<string, StudyChapter[]>();
      const exByCh = new Map<string, StudyExercise[]>();
      for (const b of bs) {
        const chs = await getChapters(b.id);
        chByBook.set(b.id, chs);
        for (const ch of chs) exByCh.set(ch.id, await getExercises(ch.id));
      }
      if (cancelled) return;
      setBooks(bs);
      setChaptersByBook(chByBook);
      setExercisesByChapter(exByCh);
      setLoaded(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  /** Envolve uma mutação: limpa erro, roda, recarrega; erros de negócio viram mensagem. */
  const run = async (fn: () => Promise<unknown>) => {
    setError("");
    try {
      await fn();
      await loadAll();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erro na operação");
    }
  };

  const chapterStatus = (ch: StudyChapter): StudyStatus =>
    deriveChapterStatus(
      ch.ownStatus,
      (exercisesByChapter.get(ch.id) ?? []).map((e) => e.status)
    );
  const bookStatus = (b: StudyBook): StudyStatus =>
    deriveBookStatus((chaptersByBook.get(b.id) ?? []).map(chapterStatus));

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const startEdit = (key: EditKey, current: string) => setEditing({ key, draft: current });
  const commitEdit = async (fn: (draft: string) => Promise<unknown>) => {
    if (!editing) return;
    const draft = editing.draft;
    setEditing(null);
    await run(() => fn(draft));
  };

  if (!loaded) return null;

  const someImportPreview = (bookId: string) => {
    const text = importText[bookId] ?? "";
    if (text.trim() === "") return null;
    const parsed = parseSyllabus(text);
    const exCount = parsed.reduce((n, c) => n + c.exercises.length, 0);
    return { parsed, chapters: parsed.length, exercises: exCount };
  };

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm" style={{ color: "var(--color-text-muted)" }}>
        Acompanhe onde você está nos seus livros físicos. Cadastre capítulos e exercícios
        manualmente ou cole o sumário para importar — o resultado é sempre editável.
      </p>

      {error && (
        <span className="text-sm" style={{ color: "var(--color-accent-pink)" }}>
          {error}
        </span>
      )}

      {/* Novo livro */}
      <div className="flex flex-wrap items-end gap-2">
        <input
          value={newBookTitle}
          onChange={(e) => setNewBookTitle(e.target.value)}
          placeholder="Título do livro"
          className="rounded-md px-3 py-2 text-sm"
          style={inputStyle}
        />
        <input
          value={newBookAuthor}
          onChange={(e) => setNewBookAuthor(e.target.value)}
          placeholder="Autor (opcional)"
          className="rounded-md px-3 py-2 text-sm"
          style={inputStyle}
        />
        <button
          onClick={(e) => {
            e.currentTarget.blur();
            if (!newBookTitle.trim()) return;
            void run(() => createBook(newBookTitle, newBookAuthor)).then(() => {
              setNewBookTitle("");
              setNewBookAuthor("");
            });
          }}
          className="px-3 py-2 text-sm font-medium rounded-md"
          style={{ background: "var(--color-accent-purple)", color: "#fff" }}
        >
          Novo livro
        </button>
      </div>

      {books.length === 0 && (
        <p className="text-sm" style={{ color: "var(--color-text-dim)" }}>
          Nenhum livro ainda — cadastre o primeiro acima.
        </p>
      )}

      {/* Lista de livros */}
      <div className="flex flex-col gap-3">
        {books.map((book) => {
          const chapters = chaptersByBook.get(book.id) ?? [];
          const isOpen = expandedBooks.has(book.id);
          const editingBook = editing?.key === `b:${book.id}`;
          const preview = someImportPreview(book.id);
          return (
            <div
              key={book.id}
              className="rounded-lg p-4 flex flex-col gap-3"
              style={{ background: "var(--color-bg-card)" }}
            >
              {/* Cabeçalho do livro */}
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    onClick={(e) => {
                      e.currentTarget.blur();
                      setExpandedBooks(toggle(expandedBooks, book.id));
                    }}
                    className="text-sm"
                    style={{ color: "var(--color-text-dim)" }}
                    aria-label={isOpen ? "Recolher" : "Expandir"}
                  >
                    {isOpen ? "▾" : "▸"}
                  </button>
                  {editingBook ? (
                    <input
                      autoFocus
                      value={editing.draft}
                      onChange={(e) => setEditing({ key: editing.key, draft: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void commitEdit((d) => updateBook(book.id, { title: d }));
                        if (e.key === "Escape") setEditing(null);
                      }}
                      onBlur={() => void commitEdit((d) => updateBook(book.id, { title: d }))}
                      className="rounded-md px-2 py-1 text-sm"
                      style={inputStyle}
                    />
                  ) : (
                    <span className="font-medium truncate" style={{ color: "var(--color-text-primary)" }}>
                      {book.title}
                      {book.author && (
                        <span className="text-xs ml-2" style={{ color: "var(--color-text-dim)" }}>
                          {book.author}
                        </span>
                      )}
                    </span>
                  )}
                  <StatusPill status={bookStatus(book)} />
                </div>
                <div className="flex items-center gap-1">
                  <IconBtn label="✎" title="Renomear livro" onClick={() => startEdit(`b:${book.id}`, book.title)} />
                  <IconBtn label="↑" title="Mover para cima" onClick={() => void run(() => moveBook(book.id, "up"))} />
                  <IconBtn label="↓" title="Mover para baixo" onClick={() => void run(() => moveBook(book.id, "down"))} />
                  <IconBtn label="🗑" title="Remover livro" onClick={() => void run(() => deleteBook(book.id))} />
                </div>
              </div>

              {isOpen && (
                <div className="flex flex-col gap-3 pl-4">
                  {/* Ações do livro */}
                  <div className="flex flex-wrap gap-2">
                    <IconBtn
                      label={importOpen.has(book.id) ? "Fechar importação" : "Importar sumário"}
                      title="Colar sumário para importar"
                      onClick={() => setImportOpen(toggle(importOpen, book.id))}
                    />
                    <input
                      value={chapterDraft[book.id] ?? ""}
                      onChange={(e) => setChapterDraft({ ...chapterDraft, [book.id]: e.target.value })}
                      placeholder="Novo capítulo"
                      className="rounded-md px-2 py-1 text-sm"
                      style={inputStyle}
                    />
                    <IconBtn
                      label="+ Capítulo"
                      title="Adicionar capítulo"
                      onClick={() => {
                        const title = chapterDraft[book.id] ?? "";
                        if (!title.trim()) return;
                        void run(() => addChapter(book.id, title)).then(() =>
                          setChapterDraft({ ...chapterDraft, [book.id]: "" })
                        );
                      }}
                    />
                  </div>

                  {/* Importação (textarea + preview) */}
                  {importOpen.has(book.id) && (
                    <div className="flex flex-col gap-2">
                      <textarea
                        value={importText[book.id] ?? ""}
                        onChange={(e) => setImportText({ ...importText, [book.id]: e.target.value })}
                        rows={6}
                        placeholder={"Cole o sumário aqui.\nEx.:\nCapítulo 1 — Fundamentos\n    Postura\n    Afinação"}
                        className="rounded-md px-3 py-2 text-sm resize-y font-mono"
                        style={inputStyle}
                      />
                      {preview ? (
                        <div className="flex items-center gap-3 flex-wrap">
                          <span className="text-sm" style={{ color: "var(--color-text-muted)" }}>
                            {preview.chapters} capítulo{preview.chapters === 1 ? "" : "s"},{" "}
                            {preview.exercises} exercício{preview.exercises === 1 ? "" : "s"} detectados
                          </span>
                          <button
                            onClick={(e) => {
                              e.currentTarget.blur();
                              void run(() => importSyllabus(book.id, preview.parsed)).then(() => {
                                setImportText({ ...importText, [book.id]: "" });
                                setImportOpen(toggle(importOpen, book.id));
                                setExpandedBooks(new Set(expandedBooks).add(book.id));
                              });
                            }}
                            className="px-3 py-1.5 text-sm font-medium rounded-md"
                            style={{ background: "var(--color-accent-purple)", color: "#fff" }}
                          >
                            Importar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs" style={{ color: "var(--color-text-dim)" }}>
                          Cole um sumário para ver o que será importado.
                        </span>
                      )}
                    </div>
                  )}

                  {/* Capítulos */}
                  {chapters.length === 0 ? (
                    <span className="text-sm" style={{ color: "var(--color-text-dim)" }}>
                      Sem capítulos ainda.
                    </span>
                  ) : (
                    chapters.map((ch) => {
                      const exercises = exercisesByChapter.get(ch.id) ?? [];
                      const chOpen = expandedChapters.has(ch.id);
                      const derived = chapterStatus(ch);
                      const editingCh = editing?.key === `c:${ch.id}`;
                      return (
                        <div key={ch.id} className="flex flex-col gap-2">
                          <div className="flex items-center justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-2 min-w-0">
                              <button
                                onClick={(e) => {
                                  e.currentTarget.blur();
                                  setExpandedChapters(toggle(expandedChapters, ch.id));
                                }}
                                className="text-xs"
                                style={{ color: "var(--color-text-dim)" }}
                              >
                                {chOpen ? "▾" : "▸"}
                              </button>
                              {editingCh ? (
                                <input
                                  autoFocus
                                  value={editing.draft}
                                  onChange={(e) => setEditing({ key: editing.key, draft: e.target.value })}
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") void commitEdit((d) => renameChapter(ch.id, d));
                                    if (e.key === "Escape") setEditing(null);
                                  }}
                                  onBlur={() => void commitEdit((d) => renameChapter(ch.id, d))}
                                  className="rounded-md px-2 py-1 text-sm"
                                  style={inputStyle}
                                />
                              ) : (
                                <span className="text-sm truncate" style={{ color: "var(--color-text-primary)" }}>
                                  {ch.title}
                                </span>
                              )}
                              {/* Com exercícios: status derivado read-only; sem: own_status clicável */}
                              {exercises.length > 0 ? (
                                <StatusPill status={derived} />
                              ) : (
                                <StatusPill
                                  status={ch.ownStatus ?? "nao_iniciado"}
                                  onClick={() =>
                                    void run(() =>
                                      setChapterOwnStatus(ch.id, STATUS_CYCLE[ch.ownStatus ?? "nao_iniciado"])
                                    )
                                  }
                                />
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <IconBtn label="✎" title="Renomear capítulo" onClick={() => startEdit(`c:${ch.id}`, ch.title)} />
                              <IconBtn label="↑" title="Mover para cima" onClick={() => void run(() => moveChapter(ch.id, "up"))} />
                              <IconBtn label="↓" title="Mover para baixo" onClick={() => void run(() => moveChapter(ch.id, "down"))} />
                              <IconBtn label="🗑" title="Remover capítulo" onClick={() => void run(() => removeChapter(ch.id))} />
                            </div>
                          </div>

                          {chOpen && (
                            <div className="flex flex-col gap-1.5 pl-5">
                              {exercises.map((ex) => {
                                const editingEx = editing?.key === `e:${ex.id}`;
                                return (
                                  <div key={ex.id} className="flex items-center justify-between gap-2 flex-wrap">
                                    <div className="flex items-center gap-2 min-w-0">
                                      <StatusPill
                                        status={ex.status}
                                        onClick={() => void run(() => setExerciseStatus(ex.id, STATUS_CYCLE[ex.status]))}
                                      />
                                      {editingEx ? (
                                        <input
                                          autoFocus
                                          value={editing.draft}
                                          onChange={(e) => setEditing({ key: editing.key, draft: e.target.value })}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") void commitEdit((d) => renameExercise(ex.id, d));
                                            if (e.key === "Escape") setEditing(null);
                                          }}
                                          onBlur={() => void commitEdit((d) => renameExercise(ex.id, d))}
                                          className="rounded-md px-2 py-1 text-sm"
                                          style={inputStyle}
                                        />
                                      ) : (
                                        <span className="text-sm truncate" style={{ color: "var(--color-text-muted)" }}>
                                          {ex.label}
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <IconBtn label="✎" title="Renomear exercício" onClick={() => startEdit(`e:${ex.id}`, ex.label)} />
                                      <IconBtn label="↑" title="Mover para cima" onClick={() => void run(() => moveExercise(ex.id, "up"))} />
                                      <IconBtn label="↓" title="Mover para baixo" onClick={() => void run(() => moveExercise(ex.id, "down"))} />
                                      <IconBtn label="🗑" title="Remover exercício" onClick={() => void run(() => removeExercise(ex.id))} />
                                    </div>
                                  </div>
                                );
                              })}
                              <div className="flex items-center gap-2">
                                <input
                                  value={exerciseDraft[ch.id] ?? ""}
                                  onChange={(e) => setExerciseDraft({ ...exerciseDraft, [ch.id]: e.target.value })}
                                  placeholder="Novo exercício"
                                  className="rounded-md px-2 py-1 text-sm"
                                  style={inputStyle}
                                />
                                <IconBtn
                                  label="+ Exercício"
                                  title="Adicionar exercício"
                                  onClick={() => {
                                    const label = exerciseDraft[ch.id] ?? "";
                                    if (!label.trim()) return;
                                    void run(() => addExercise(ch.id, label)).then(() =>
                                      setExerciseDraft({ ...exerciseDraft, [ch.id]: "" })
                                    );
                                  }}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
