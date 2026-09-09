import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  _resetStudyTrackFallback,
  addChapter,
  addExercise,
  createBook,
  deleteBook,
  getChapters,
  getExercises,
  getStudyBooks,
  importSyllabus,
  moveBook,
  moveExercise,
  removeChapter,
  renameChapter,
  setExerciseStatus,
} from "./study-track";
import { initDb } from "./database";

// SQLite não roda em jsdom — usamos o FALLBACK EM MEMÓRIA (initDb rejeita) como banco de
// verdade pros testes de CRUD. As regras vivem em JS, então o comportamento é o mesmo.
vi.mock("./database", () => ({ initDb: vi.fn() }));

beforeEach(() => {
  _resetStudyTrackFallback();
  vi.mocked(initDb).mockRejectedValue(new Error("no tauri"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

describe("seed", () => {
  it("nasce com os 6 livros do brief (fallback espelha a migração v2)", async () => {
    const books = await getStudyBooks();
    expect(books.map((b) => b.title)).toEqual([
      "Hal Leonard Bass Method",
      "Jaco Pastorius Bass Method",
      "Simandl",
      "Ariane Cap",
      "Rufus Reid",
      "Gary Willis",
    ]);
  });
});

describe("CRUD de livro", () => {
  it("cria livro com título/autor e ordena por position", async () => {
    const book = await createBook("Meu Livro", "Fulano");
    expect(book.title).toBe("Meu Livro");
    expect(book.author).toBe("Fulano");
    const books = await getStudyBooks();
    expect(books.find((b) => b.id === book.id)).toBeDefined();
  });

  it("título vazio lança", async () => {
    await expect(createBook("   ")).rejects.toThrow("título");
  });

  it("moveBook troca a ordem com o vizinho", async () => {
    const a = await createBook("Livro A");
    const b = await createBook("Livro B");
    // ambos entram DEPOIS dos 6 semeados; move A pra baixo troca com B
    await moveBook(a.id, "down");
    const books = await getStudyBooks();
    const ia = books.findIndex((x) => x.id === a.id);
    const ib = books.findIndex((x) => x.id === b.id);
    expect(ib).toBeLessThan(ia); // B agora vem antes de A
  });

  it("deleteBook remove o livro e cascateia capítulos + exercícios", async () => {
    const book = await createBook("Livro");
    const ch = await addChapter(book.id, "Cap 1");
    await addExercise(ch.id, "Ex 1");

    await deleteBook(book.id);

    expect((await getStudyBooks()).find((b) => b.id === book.id)).toBeUndefined();
    expect(await getChapters(book.id)).toHaveLength(0);
    expect(await getExercises(ch.id)).toHaveLength(0);
  });
});

describe("capítulos e exercícios", () => {
  it("adiciona capítulo e exercício; positions sequenciais", async () => {
    const book = await createBook("Livro");
    const c1 = await addChapter(book.id, "Cap 1");
    const c2 = await addChapter(book.id, "Cap 2");
    expect(c1.position).toBe(0);
    expect(c2.position).toBe(1);

    const e1 = await addExercise(c1.id, "Ex 1");
    const e2 = await addExercise(c1.id, "Ex 2");
    expect(e1.position).toBe(0);
    expect(e2.position).toBe(1);
    expect(await getExercises(c1.id)).toHaveLength(2);
  });

  it("renomeia capítulo e alterna status de exercício", async () => {
    const book = await createBook("Livro");
    const ch = await addChapter(book.id, "Cap");
    await renameChapter(ch.id, "Cap Renomeado");
    expect((await getChapters(book.id))[0].title).toBe("Cap Renomeado");

    const ex = await addExercise(ch.id, "Ex");
    await setExerciseStatus(ex.id, "concluido");
    expect((await getExercises(ch.id))[0].status).toBe("concluido");
  });

  it("removeChapter cascateia os exercícios", async () => {
    const book = await createBook("Livro");
    const ch = await addChapter(book.id, "Cap");
    await addExercise(ch.id, "Ex");
    await removeChapter(ch.id);
    expect(await getChapters(book.id)).toHaveLength(0);
    expect(await getExercises(ch.id)).toHaveLength(0);
  });

  it("moveExercise troca a ordem com o vizinho", async () => {
    const book = await createBook("Livro");
    const ch = await addChapter(book.id, "Cap");
    const e1 = await addExercise(ch.id, "Primeiro");
    await addExercise(ch.id, "Segundo");

    await moveExercise(e1.id, "down");

    const labels = (await getExercises(ch.id)).map((e) => e.label);
    expect(labels).toEqual(["Segundo", "Primeiro"]);
  });
});

describe("importSyllabus", () => {
  it("insere em lote capítulos + exercícios do parser, após os existentes", async () => {
    const book = await createBook("Livro");
    await addChapter(book.id, "Cap existente");

    await importSyllabus(book.id, [
      { title: "Capítulo A", exercises: [{ label: "A1" }, { label: "A2" }] },
      { title: "Capítulo B", exercises: [] },
    ]);

    const chapters = await getChapters(book.id);
    expect(chapters.map((c) => c.title)).toEqual(["Cap existente", "Capítulo A", "Capítulo B"]);
    const capA = chapters.find((c) => c.title === "Capítulo A")!;
    expect((await getExercises(capA.id)).map((e) => e.label)).toEqual(["A1", "A2"]);
  });
});
