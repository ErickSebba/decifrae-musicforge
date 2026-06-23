# Prompt de Projeto — Decifrae-MusicForge (App de Estudo de Baixo)

> **Como usar este documento:** este é um prompt completo de projeto. Pode ser colado inteiro em Claude Code (ou outro agente de IA) como brief inicial, ou usado fase por fase conforme o roadmap na seção 9. Ele assume que quem está construindo (humano ou IA) não conhece o contexto, então é autocontido.

---

## 1. Contexto

Você vai construir um **app desktop instalável (Windows/Linux)** para auxiliar o estudo individual de baixo elétrico. O usuário é um estudante de Engenharia de Computação que estuda baixo seguindo métodos consagrados (Hal Leonard Bass Method, Jaco Pastorius Bass Method, e outros como Simandl, Ariane Cap, Rufus Reid, Gary Willis) e já mantém um projeto pessoal de processamento de sinal musical (CQT para identificação de acordes, PYIN para detecção de nota única em guitarra/baixo).

O app **não substitui o baixo físico** — ele é uma ferramenta de apoio: treino de leitura, teoria, visualização, composição de frases próprias e acompanhamento de evolução. A escuta automática do baixo tocado de verdade (via microfone) é um **módulo futuro**, fora do escopo inicial.

> **Nota sobre o nome (Decifrae-MusicForge):** o nome já antecipa que, no futuro, o ecossistema pode crescer pra além do baixo (outros instrumentos). Isso não muda o escopo do MVP, mas é um bom motivo pra evitar hardcodar "baixo" em lugares que poderiam ser genéricos — por exemplo, número de cordas e afinação do instrumento (seção 6, Módulo 2) devem ser uma configuração, não uma constante fixa no código, mesmo que hoje o único valor disponível seja "baixo de 4 cordas, afinação EADG".

## 2. Objetivo do Produto

Uma plataforma pessoal de estudo de baixo com 5 módulos centrais, **arquitetados desde o início como um sistema único coeso**, mesmo que implementados em fases:

1. Leitura de partitura/ritmo com jogos de treino (mouse/teclado)
2. Teoria musical, escalas e composição de frases próprias com visualização no braço do baixo + síntese sonora
3. Acompanhamento de progresso salvo
4. Importação e criação de tablaturas/partituras próprias, com reprodução de som
5. Banco de exercícios com registro de prática (BPM, dificuldade, autoavaliação)

## 3. Stack Tecnológica Recomendada

| Camada | Tecnologia | Por quê |
|---|---|---|
| Shell desktop | **Tauri 2.0** (Rust + WebView) | Empacota Windows/Linux, binário leve, e permite no futuro rodar um *sidecar* em Python/Rust para detecção de pitch (reaproveitando a lógica PYIN do decifrae.com.br) |
| Frontend | **React + TypeScript + Tailwind CSS** | Familiaridade prévia com dev web; ecossistema maduro para UI de áudio/notação |
| Estado | **Zustand** | Mais simples que Redux para o tamanho do projeto |
| Notação + Tablatura | **AlphaTab** | Renderiza partitura E tablatura juntas, sincroniza cursor com playback, importa MusicXML e arquivos Guitar Pro (.gp/.gpx), e tem formato de texto próprio (**alphaTex**) que serve como base para o editor de frases/partituras próprias (módulos 2 e 4) |
| Teoria musical (motor) | **tonal.js** | Biblioteca JS madura para escalas, intervalos, acordes e campo harmônico — evita reescrever teoria musical do zero |
| Síntese de áudio | **Web Audio API** (`OscillatorNode`) | Gera o som de cada nota via onda senoidal pura, sem depender de samples gravados — exatamente como descrito na ideia original |
| Banco de dados local | **SQLite via `tauri-plugin-sql`** | Persistência real em disco (progresso, exercícios, biblioteca de partituras), sem as limitações de armazenamento de navegador |
| Gráficos de progresso | **Recharts** | Dashboards de evolução (BPM ao longo do tempo, frequência de prática, etc.) |

## 4. Arquitetura Geral (camadas)

```
┌─────────────────────────────────────────────┐
│  UI (React) — telas dos 5 módulos            │
├─────────────────────────────────────────────┤
│  Music Engine — teoria (tonal.js) +          │
│  modelo de dados de partitura/tab (alphaTex) │
├─────────────────────────────────────────────┤
│  Audio Engine — Web Audio API (síntese)      │
│  + player do AlphaTab (playback de scores)   │
├─────────────────────────────────────────────┤
│  Persistence — SQLite local (Tauri)          │
├─────────────────────────────────────────────┤
│  [FUTURO] Listening Engine — pitch detection  │
│  via microfone (sidecar reaproveitando PYIN) │
└─────────────────────────────────────────────┘
```

Ponto de design importante: a camada de **input de prática** deve ser abstraída (`PracticeInputProvider`), com uma implementação inicial `KeyboardMouseInput` (módulo 1) e uma futura `MicListenInput` plugável sem refatorar os módulos de jogo/treino.

## 5. Base Pedagógica

A progressão didática segue a estrutura comum aos métodos graduados de baixo (fundamentos → leitura rítmica → escalas/teoria → técnica → aplicação/improvisação), sem copiar exercícios específicos de nenhum livro — os exercícios e frases gerados pelo app devem ser **originais**, criados pela própria ferramenta (geração algorítmica ou inseridos manualmente pelo usuário).

Sugestão de progressão de níveis dentro do app:
1. **Fundamentos** — notas no braço, valores de tempo, leitura de pauta em posições fixas
2. **Leitura rítmica** — padrões de ritmo cada vez mais complexos, síncope, subdivisões
3. **Escalas e teoria** — maior, menor, modos, campo harmônico, intervalos
4. **Composição/técnica aplicada** — criar frases próprias usando o vocabulário aprendido
5. **Aplicação livre** — exercícios de "BPM alvo" e autoavaliação, aproximando de repertório real

## 6. Módulos Detalhados

### Módulo 1 — Leitura de Partitura e Ritmo
- Exibir partitura (via AlphaTab) com cursor de playback.
- **Seletor de clave**: tanto nas telas de exercício quanto nas explicações teóricas, permitir escolher a clave em que a partitura é exibida (Fá — padrão pro baixo —, Sol, e futuramente Dó se fizer sentido). A troca de clave deve re-renderizar a mesma partitura/nota na clave selecionada, sem mudar o conteúdo musical, só a notação visual. Isso serve tanto pra treinar leitura na clave padrão do baixo quanto pra entender claves "estrangeiras" usadas em partituras de outros instrumentos.
- Jogos de treino:
  - **Modo "tap"**: nota cai/avança visualmente, usuário aperta tecla/clica no tempo certo (estilo rhythm game).
  - **Modo "leitura cronometrada"**: identificar a nota/posição correta na pauta antes do tempo acabar.
  - **Modo "ditado rítmico"**: ouvir um padrão (clique/metrônomo) e reproduzir via teclado.
  - **Modo "livre" (sem cronômetro)**: exercício simples de identificação de nota/posição, sem pressão de tempo nem métricas de desempenho — pensado pra dias cansados, sessões curtas, ou só revisão tranquila. Mesma mecânica do modo cronometrado, mas sem contagem regressiva, sem streak e sem penalidade por demora; o usuário avança no próprio ritmo clicando "próxima".
- Métricas de acerto (nos modos com tempo): precisão temporal (ms de desvio), acerto de nota, streak.
- Dificuldade progressiva configurável (BPM, complexidade rítmica, clave).

### Módulo 2 — Teoria, Escalas e Composição de Frases
- Dividir claramente **Teoria** (explicações, campo harmônico, intervalos) de **Prática** (exercícios aplicados).
- **Seletor de clave também aqui**: as explicações teóricas (ex: onde fica cada nota na pauta) e os exercícios de escalas devem respeitar a mesma clave escolhida pelo usuário (Fá, Sol, etc. — ver Módulo 1). Útil tanto pra fixar a leitura na clave padrão do baixo quanto pra quem quiser eventualmente ler partituras em clave de Sol (ex: linhas escritas originalmente pra outro instrumento).
- **Visualização do braço do baixo**: componente React/SVG mostrando onde cada nota da escala/frase está localizada (4 cordas, traste configurável), sincronizado com a nota ativa durante playback.
- **Síntese sonora por nota**: ao clicar numa nota (na pauta ou no braço virtual), tocar o seno correspondente à frequência exata daquela nota via Web Audio API.
- **Editor de frases próprias**: interface para o usuário montar suas próprias frases/escalas (grade rítmica + seleção de nota/posição), que gera internamente uma string **alphaTex** e renderiza via AlphaTab — útil tanto para criar quanto para depois exportar/imprimir.
- Todo texto teórico gerado aqui (explicações, regras, exemplos) deve ser registrado automaticamente na Central de Conteúdo (ver Módulo 3.4), pra você poder revisar/confirmar depois.

### Módulo 3 — Acompanhamento de Progresso

Este módulo cobre quatro tipos diferentes de progresso, que são conceitualmente distintos e merecem telas próprias:

**3.1. Progresso em Exercícios (práticos e teóricos, Módulos 1 e 5)**
- Por exercício: recorde pessoal (ex: maior BPM com 100% de acerto), histórico completo de tentativas, últimos N resultados em destaque, evolução em gráfico de linha.
- Visão agregada: frequência de prática (heatmap de dias), distribuição de tempo por módulo/categoria, exercícios "estagnados" (sem melhora há X sessões) destacados.
- Gráficos via Recharts; dados em SQLite local.

**3.2. Trilha de Estudo Externa (livros físicos)**
- Cadastro de livros que você possui (ex: Hal Leonard Bass Method, Jaco Pastorius Bass Method), cada um com uma lista de capítulos/exercícios.
- Essa lista pode ser **digitada manualmente** (você cria a estrutura de capítulos/exercícios uma vez) ou **importada** a partir de um sumário em texto/CSV que você cole ou carregue.
- Para cada capítulo/exercício: marcação simples de status (não iniciado / em andamento / concluído) — é essencialmente um checklist de leitura que reflete onde você está no livro físico, sem nenhum conteúdo do livro em si armazenado no app (só a estrutura: nome/número do capítulo e exercício).

**3.3. Mapa de Progresso da Teoria Gerada pelo App**
- Visualização tipo mapa/árvore de tópicos (ex: escalas maiores → modos → campo harmônico → ...), cada nó com status visual: não iniciado / estudando / praticado / dominado.
- Esse status é atualizado automaticamente conforme você completa exercícios relacionados (Módulo 1/5) ou manualmente, se quiser se autoavaliar num tópico específico.

**3.4. Central de Conteúdo e Revisão**
- Todo conteúdo teórico **gerado pelo app** (explicações, regras, exemplos) deve ficar registrado de forma acessível e revisável nessa tela — uma espécie de repositório de "tudo que o app já te explicou".
- Cada item de conteúdo tem um status de revisão: `não revisado` / `confirmado por mim` / `contém erro` (com campo de observação livre).
- Objetivo explícito: te dar uma forma fácil de conferir se algo gerado está errado ou impreciso, e manter um registro do que já foi validado por você versus o que ainda não foi checado contra fontes confiáveis (seus livros, professores, etc.).

### Módulo 4 — Importação e Criação de Tablaturas/Partituras Próprias
- Importação: MusicXML e arquivos Guitar Pro (.gp3/.gp4/.gp5/.gpx) via AlphaTab.
- Biblioteca pessoal de partituras/tabs importadas e criadas, organizável por tags (música, exercício, escala, etc.).
- Reprodução de som de qualquer item da biblioteca (playback nativo do AlphaTab, com opção de usar a síntese senoidal pura para destacar uma nota específica sob estudo).
- Editor próprio (reaproveita o mesmo editor alphaTex do Módulo 2) para criar tablaturas do zero.

### Módulo 5 — Banco de Exercícios e Diário de Prática
- Cadastro de exercício: nome, módulo/categoria, nível de complexidade (escala configurável, ex: 1–5), BPM-alvo.
- Registro de sessão de prática: BPM realmente tocado, duração, autoavaliação (ex: nota 1–5 ou texto livre), data.
- Sugestão adaptativa simples: priorizar exercícios com avaliação baixa ou BPM estagnado nas últimas sessões.
- Esse módulo é o ponto de conexão entre o que é feito **dentro do app** (leitura, teoria) e o que é praticado **no baixo físico, offline** — o usuário registra manualmente o resultado da prática real.

### Módulo 6 (Futuro, fora do escopo inicial) — Escuta Real do Baixo
- Objetivo futuro: o app escuta o baixo via microfone e dá feedback automático de nota/ritmo certo, reaproveitando a lógica de detecção de pitch (PYIN) já usada no decifrae.com.br.
- Não implementar agora — apenas garantir que a interface `PracticeInputProvider` (seção 4) permita plugar isso sem refatoração grande.
- Decisão técnica a revisitar no futuro: rodar a detecção em Rust/WASM no próprio Tauri, ou via sidecar Python empacotado (reaproveitando código existente do decifrae).

## 7. Identidade Visual

- **Tema escuro** como padrão, seguindo a mesma linha já usada no decifrae.com.br — mantém consistência visual entre os dois projetos do mesmo "ecossistema Decifrae".
- **Inspiração: Moises.ai** — referência de app de áudio/música com estética moderna: fundo escuro (cinza-chumbo, evitar preto puro pra não perder contraste), acentos vibrantes em gradiente (tons de roxo/rosa/teal são comuns nesse tipo de app), cards com cantos arredondados, tipografia sans-serif limpa, e uso de elementos visuais ligados a áudio (forma de onda, equalizador, barras de frequência) como motivo decorativo recorrente — faz sentido aparecer sutilmente em telas de playback e síntese de nota.
- Recomendação prática: antes de fixar a paleta exata, vale abrir o Moises.ai e o decifrae.com.br lado a lado e extrair 4-5 cores-chave de cada (ferramenta tipo color picker do navegador resolve), já que a aparência de apps de áudio costuma evoluir com frequência e o ideal é confirmar visualmente a referência mais atual no momento da implementação.
- Esses tokens visuais (cores, espaçamento, raio de borda, tipografia) devem ficar centralizados num arquivo de tema do Tailwind, não espalhados pelos componentes.

## 8. Requisitos Não-Funcionais
- **Offline-first**: nenhuma funcionalidade essencial deve depender de internet.
- **Privacidade**: todos os dados de progresso ficam no disco do usuário (SQLite local), sem telemetria.
- **Performance de áudio**: latência baixa na síntese de notas (Web Audio API atende bem isso).
- **Multiplataforma desktop**: build para Windows e Linux a partir da mesma base de código (Tauri).
- **Extensibilidade**: arquitetura em camadas (seção 4) para permitir o Módulo 6 futuro sem reescrita.

## 9. Roadmap Sugerido (fases de implementação)

| Fase | Entrega |
|---|---|
| 0 | Scaffold do projeto: Tauri + React + Tailwind + SQLite configurado, AlphaTab integrado renderizando uma partitura de exemplo |
| 1 | Módulo 1 (leitura/ritmo) + base do Módulo 2 (teoria + visualização do braço + síntese senoidal) |
| 2 | Módulo 3 (progresso) + Módulo 5 (diário de exercícios) — esses dois dependem do schema de banco de dados, então fazem sentido juntos |
| 3 | Módulo 4 (importação/editor de tabs/partituras próprias) |
| 4 (futuro) | Módulo 6 (escuta real via microfone) |

## 10. Como Usar Este Prompt
- **Para começar com Claude Code**: cole este documento inteiro como prompt inicial e peça para escaldar a Fase 0. Depois, avance fase por fase, sempre citando "seguindo o documento de projeto, implemente o Módulo X conforme a seção 6".
- **Para iterar**: ao final de cada fase, peça revisão de código e ajuste o roadmap se necessário — este documento é um guia, não um contrato rígido.

## 11. Decisões Abertas (revisitar durante o desenvolvimento)
- Formato prioritário de importação (MusicXML vs Guitar Pro) caso seja preciso simplificar o MVP do Módulo 4.
- Estrutura exata do "mapa de progresso da teoria" (Módulo 3.3) — quantos tópicos, como o grafo de dependência entre eles é definido.
- Se algum dia fizer sentido sincronizar progresso entre múltiplos computadores (exigiria backend — hoje fora do escopo, já que tudo é local).
- Se/quando expandir pra outros instrumentos (ver nota sobre o nome na seção 1), revisar o quanto da camada de visualização e teoria já está de fato genérica vs. ainda acoplada a baixo de 4 cordas.
