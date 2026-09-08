# Decifrae-MusicForge — Estado do Projeto (visão geral consolidada)

> Documento-panorama gerado em **2026-09-02**, após a fase 5b. Reúne, num lugar só,
> o que o projeto é, o que já foi feito (com os commits), as decisões tomadas, e o
> que falta — em ordem. Serve pra retomar o contexto rápido depois de um tempo parado.
>
> **Relação com os outros docs:** `docs/project-brief.md` é o brief fundador (os 5
> módulos, a visão); `docs/CONTEXTO-PROJETO.md` é o handoff técnico vivo (mapa do
> código linha a linha, mecânicas "não reabrir"). Este documento fica ENTRE os dois:
> mais navegável que o CONTEXTO, mais atualizado que o brief. Quando algo aqui
> conflitar com o código, o código vence.

---

## 1. O que é o projeto

App **desktop instalável (Windows/Linux, Tauri)** para o estudo individual de **baixo
elétrico**. É ferramenta de APOIO — treino de leitura, teoria, visualização no braço,
composição de frases, acompanhamento de evolução — **não substitui o instrumento
físico**. O usuário (dono do produto) é estudante de Eng. de Computação e estuda baixo
por métodos graduados (Hal Leonard, Jaco Pastorius etc.); a pedagogia do app é original,
sem copiar conteúdo protegido.

O nome antecipa expansão futura pra outros instrumentos → **número de cordas e afinação
são configuração, nunca constante fixa** no código.

### Os 5 módulos do produto (do brief)

1. **Leitura de partitura e ritmo** — jogos de treino (tap, cronometrado, ditado, livre).
2. **Teoria, escalas e composição** — teoria + braço virtual + síntese sonora + editor de frases.
3. **Acompanhamento de progresso** — 4 partes: 3.1 exercícios, 3.2 trilha de livros, 3.3 mapa de teoria, 3.4 central de conteúdo.
4. **Importação e criação de tablaturas/partituras** — MusicXML/Guitar Pro via AlphaTab + editor próprio.
5. **Banco de exercícios e diário de prática** — cadastro + registro de sessões reais + sugestão adaptativa.
6. **(Futuro, fora de escopo)** — escuta do baixo via microfone (pitch detection).

---

## 2. Stack e arquitetura

**Stack:** Tauri 2.0 (Rust + WebView) · React 19 + TypeScript · Tailwind CSS v4
(`@theme` em `src/index.css`, tokens centralizados) · AlphaTab 1.8.3 (notação/tablatura
via alphaTex, cursor dirigido externamente, sem soundfont) · Web Audio API nativa
(síntese senoidal; `AudioContext.currentTime` é o clock de tudo) · SQLite via
`tauri-plugin-sql` · Zustand (estado global) · Recharts 3 (gráficos, desde a 3.1) ·
Vitest 4 + Testing Library. **Teoria musical escrita à mão** (`note-utils.ts` +
`theory-engine.ts`), sem tonal.js — decisão tomada na prática (ver §5).

**Arquitetura em camadas:**

```
UI (React/TSX)      → src/pages/, src/components/  (+ src/hooks/)
Engines PUROS       → src/engine/  (note-utils, theory-engine, theory-tex, reading-engine,
                      rhythm-engine, rhythm-generator, levels, progress-stats,
                      diary-stats, practice-suggestion — sem React/áudio/db, tudo testado)
Audio Engine        → src/engine/audio-engine.ts  (Web Audio API)
Persistence         → src/db/  (database.ts + módulos de acesso, SQLite via plugin)
[FUTURO] Listening  → pitch detection via microfone (Módulo 6)
```

**Comandos:** `npm run tauri dev` (app desktop) · `npm run dev` (web, sem Tauri/SQLite —
há fallback em memória) · `npm test -- --run` · `npx tsc --noEmit` · `npm run lint`.

**Estado atual da suíte:** **359 testes verdes em 29 arquivos**, `tsc` limpo, lint
0 errors (12 warnings deliberados — regras do React Compiler sobre padrões conscientes).

---

## 3. O que já foi feito — histórico por fase (com commits)

Ordem cronológica real. Commits sem prefixo `feat:`/`chore:` (ou "(manual)") foram feitos
direto pelo usuário.

### Fundação (jun/2026)
| Fase | Entrega | Commit |
|---|---|---|
| 0 | Scaffold Tauri + React + AlphaTab + SQLite + Vitest | `238c691` |
| 1.1 | Roteamento entre os 5 módulos (Zustand) + placeholders + testes | `29bfb1d` |
| 1.2 | Audio engine (síntese senoidal, envelope) + grade de teste | `4a86590` |
| 1.3 | Fretboard SVG configurável + `note-utils.ts` + refactor do áudio | `24e5457` |

### Módulo 1 — Leitura e Ritmo (jun–jul/2026) — COMPLETO
| Fase | Entrega | Commit |
|---|---|---|
| 1.4 | Modo Livre (identificação de nota, clave de fá, naturais E2–A3) | `26afe28` |
| 1.5 | Modo Tap (mecânica base: count-in, metrônomo, avaliação de timing) | `9c36ac3`+ |
| 3a | Sistema de níveis do Tap + fix de sincronia do cursor | `6003bca` |
| 3b | Persistência SQLite + desbloqueio linear dos níveis | `8f73f7c` |
| 3c-1 | Gerador procedural de ritmo (4/4 e 3/4) | `bf63278` |
| 1.6a | Modo Cronometrado (tempo por nota, streak) | `9aea994` |
| 1.6b | Modo Ditado Rítmico + hook `useTapRun` (mecânica compartilhada) | `d96ccc9` |
| 1.7 | Seletor de clave Fá/Sol global (Sol escreve 8ª acima) | `6904b75` |

### Módulo 2 — Teoria e Escalas (jul/2026) — COMPLETO
| Fase | Entrega | Commit |
|---|---|---|
| 2.1a | Motor de teoria: intervalos, escala maior/menor, relativas, 7 modos | `d1d2984` |
| 2.1b | Campo harmônico: tríades diatônicas com cifra e algarismo romano | `f2f5b6e` |
| 2.2 | Visualização de escala na pauta + braço (tela Teoria e Escalas) | `f8fd447` |
| 2.1c | Pentatônicas maior/menor + blues (blue note #4) | `a8ce9d0` |
| 2.3 | Playback sincronizado de escalas (som + cursor + braço, clock único) | `9629f36` |
| 2.4 | Página Teoria/Prática + Central de Conteúdo mínima + 12 textos originais | `85d48c9` |
| 2.5 | Editor de frases próprias (grade rítmica + braço → alphaTex → playback) | `1123a48` |
| 2.5b | QoL do editor (entrada contínua, mover/inserir passos) | `eaf354e` |
| 2.6 | Seletor partitura/tablatura/ambas nas 2 telas | `cd87766` |

### Infra e marco 3+5 (jul–set/2026)
| Fase | Entrega | Commit |
|---|---|---|
| — | Validação da regressão do Tap + remoção dos logs de diagnóstico | `6b8c3a0` |
| — | Infra de lint (ESLint 10, flat config) | `4083a09` |
| **3+5.0** | **Schema de banco COMPLETO** dos Módulos 3 e 5 (6 tabelas + migração v1 + CRUD + engine de sugestão — zero UI) | `3b34dfd` |
| **3.4** | Tela de revisão da Central de Conteúdo + página Progresso em 4 abas | `8d24bf3` |
| **3.1** | Aba Exercícios: tabela agregada + BarChart (estreia do Recharts) + heatmap 12 semanas | `5889719` |
| **5a** | Diário de Prática: cadastro de exercícios + registro/listagem de sessões (+ `deleteSession`) | `b647647` |
| **5b** | Sugestão adaptativa: painel compartilhado, deep-link app→Tap / diary→registrar sessão, dispensa em memória | `620bcbe` |

**A espinha do marco Módulos 3+5 está fechada.** Nenhuma mudança de schema foi necessária
desde a fundação (3+5.0) — a decisão de desenhar o banco inteiro primeiro se pagou nas
quatro telas seguintes.

---

## 4. Estado atual — o que funciona hoje

- **Módulo 1 (Leitura e Ritmo)** — 4 modos funcionais (Livre, Tap com níveis/desbloqueio/
  persistência, Cronometrado, Ditado), gerador procedural de ritmo, clave Fá/Sol.
- **Módulo 2 (Teoria e Escalas)** — explorador de escalas/modos/pentatônicas/blues com
  pauta + braço + playback sincronizado; campo harmônico; editor de frases; seletor de
  visualização (partitura/tab/ambas). Central de Conteúdo com 12 textos teóricos originais.
- **Módulo 3 (Progresso)** — página com 4 abas:
  - **Exercícios (3.1)** ✓ — progresso agregado por exercício, gráfico e heatmap de frequência.
  - **Central de Conteúdo (3.4)** ✓ — revisão dos textos (status + observação).
  - **Trilha de estudo (3.2)** — aba desabilitada "(em breve)".
  - **Mapa de teoria (3.3)** — aba desabilitada "(em breve)".
- **Módulo 5 (Diário de Prática)** — página própria: cadastro de exercícios (editar/
  arquivar), registro de sessões (BPM, duração, autoavaliação em estrelas, data com
  backdating, observação), listagem com filtro e exclusão, e **sugestão adaptativa** no
  topo (aparece também no topo da aba Exercícios do Progresso).
- **Persistência** — SQLite local com fallback em memória pro modo web; migração
  versionada; regras de negócio em JS (testáveis com banco mockado).

---

## 5. Decisões tomadas (o "porquê" do que existe)

### Decisões técnicas de base
- **Teoria musical à mão, sem tonal.js** — controle total da grafia enarmônica (a letra
  do grau vem antes do acidente: Fá maior tem Bb, jamais A#). A lib não garantiria isso.
- **Clock único = `AudioContext.currentTime`** pra tudo que é rítmico (cursor, metrônomo,
  classificação de tap). Nunca `performance.now()` pro musical.
- **Cursor do AlphaTab dirigido externamente, sem `api.play()`** — evita a animação CSS
  que desliza sozinha e dessincroniza. Repetições escritas por extenso (nunca `\ro`/`\rc`).
- **Fallback em memória** em todo módulo de `src/db/` — o app roda em `npm run dev` (web,
  sem SQLite) sem quebrar; é também a costura por onde a persistência iria pro servidor
  numa futura versão web.

### Decisões de modelagem do marco 3+5 (fase 3+5.0 — não reabrir)
- **Schema inteiro antes das telas** — as 6 tabelas foram desenhadas de uma vez, pra não
  improvisar tabela a cada tela. Deu certo: 3.4/3.1/5a/5b foram UI pura.
- **Progresso agregado, não histórico por tentativa** — guarda-se best/média/attempts +
  contagem por dia (heatmap). Consequência consciente: **não existe curva de evolução por
  tentativa** (mudaria isso = nova tabela, decisão nova).
- **Fonte única** — `exercise_progress` absorveu a tabela antiga do Tap (migração v1
  idempotente); médias de linhas migradas nascem vazias, sem inventar histórico.
- **Conteúdo fixo no código, progresso no banco (3.2 e 3.3)** — livros/capítulos e o grafo
  de tópicos vivem no código (o usuário edita e recompila); o banco guarda só o progresso
  sobre ids estáveis. Ausência de linha = "não iniciado".
- **Mapa de teoria (3.3): auto só promove** — status automático (vindo de exercício) nunca
  rebaixa; manual grava exato.
- **Diário (M5): exercício se arquiva (nunca deleta), sessão se deleta** — exercício tem
  histórico atrelado; sessão é registro pontual. Agregados do M5 são derivados na leitura.
- **Sugestão (5b): roteamento cai do `source`** — exercício do diário NÃO tem campo de
  modo, e não precisa. `source:'app'` → abre o Tap no nível; `source:'diary'` → abre o
  registrar-sessão pré-preenchido. Dispensa é memória de sessão (não persiste).

### Decisões de produto já fechadas
- Aprovação de nível do Tap: (Perfeito+Bom)/total ≥ 80%. Desbloqueio linear derivado em
  runtime, nunca coluna no banco.
- Central de Conteúdo: os 12 textos são de autoria do usuário → nascem "confirmado"; a
  tela é ferramenta de revisão de propósito geral (serve a conteúdo gerado futuro também).
- **Tema escuro com tokens centralizados** (`@theme`) — pré-requisito do redesenho visual
  futuro; nenhuma cor solta em componente.

---

## 6. O que falta fazer — em ordem

### Fecho do Módulo 3 (BLOQUEADO por pré-requisito do usuário)
Ambas exigem o usuário escrever o **conteúdo fixo no código ANTES** da tela existir (a
UI já está prevista; o schema já existe):

1. **3.2 — Trilha de estudo externa** — checklist dos livros físicos (Hal Leonard, Jaco…).
   Pré-requisito: definir no código a estrutura `livros → capítulos → exercícios` (ids estáveis).
2. **3.3 — Mapa de progresso da teoria** — árvore de tópicos com status. Pré-requisito:
   definir os nós e as dependências do grafo.

### Próximo grande passo natural (SEM pré-requisito)
3. **Módulo 4 — Importação e criação de tablaturas/partituras** — importar MusicXML/Guitar
   Pro via AlphaTab, biblioteca pessoal organizável por tags, reprodução, e editor próprio
   (reaproveita o editor de frases da 2.5). **Inclui a persistência de frases do editor**,
   que foi deliberadamente adiada até aqui. Depende de schema novo (biblioteca de partituras).

### Futuro distante (marco próprio, não intercalar)
4. **Módulo 6 — Escuta do baixo via microfone** — pitch detection (reaproveitando PYIN do
   decifrae.com.br). Hoje só a intenção arquitetural (`PracticeInputProvider`) está prevista.
5. **Redesenho visual completo** — decisão do usuário: acontece DEPOIS das telas dos
   Módulos 3/5/4 estabilizarem. A disciplina de tokens já prepara o terreno.
6. **Integração web com o decifrae.com.br** — MusicForge no navegador, com login e dados
   no servidor. Contradiz o "offline-first" do brief conscientemente; marco do tamanho de
   um módulo.

---

## 7. Backlog vivo (itens menores, sem ordem rígida)

- **Cleanup dos 12 warnings do lint** (0 errors) — 2 `eslint-disable` órfãs + warns
  deliberados de compiler rules (latest-ref, set-state-in-effect). Não reescrever a
  mecânica de clock pra silenciar.
- **Paginação da lista de sessões (5a)** — hoje carrega todas de uma vez.
- **Distribuição por kind no progresso (3.1)** — adiada (degenerada com só 'tap'
  persistindo); volta quando Cronometrado/Ditado persistirem.
- **Persistência do Cronometrado/Ditado** — agora trivial (`saveExerciseResult('timed'|
  'dictation', …)`); falta decidir a métrica de ratio de cada um.
- **Síntese de áudio melhor** (harmônicos/samples) — há um experimento pessoal do usuário
  fora do repo (`SintetizadorTeste/`, gitignorado).
- **6/8 no gerador de ritmo** (3c-2); BPM ajustável nos playbacks; teoria além da 2.1
  (sétimas, inversões, campo harmônico modal, escalas menores harmônica/melódica);
  acidentes no pool de leitura; consolidar os geradores de tex num só; persistir
  `staveDisplay` entre sessões.

---

## 8. Processo de trabalho (como as sub-etapas são conduzidas)

- **Plan Mode antes de cada sub-etapa** — plano mostrado e aprovado antes de codar.
  Decisões de produto/UX são do usuário; as técnicas são do agente, documentadas no plano.
- **Testes junto com a feature.** Se um refactor quebra teste existente: parar e reportar,
  nunca ajustar o teste pra passar.
- **Validação manual pelo usuário** (no `tauri dev`) antes de cada commit — especialmente
  notação musical, que teste automatizado não vê.
- **Commits pequenos, um por sub-etapa.** Não commitar sem o usuário pedir.
- Ao fechar cada sub-etapa: atualizar `CONTEXTO-PROJETO.md` (e reindexar `docs/` no
  context-mode).
