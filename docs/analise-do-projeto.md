# Decifrae-MusicForge: visão geral do projeto

## O que o projeto é:

O Decifrae-MusicForge é um aplicativo desktop para estudo de baixo elétrico. A ideia central não é substituir o instrumento físico, mas apoiar o estudo com leitura, ritmo, teoria, visualização do braço do baixo, reprodução de notas e, no futuro, acompanhamento mais completo do progresso e da prática.

Ele foi pensado como um produto local, offline-first, com foco em privacidade e evolução gradual. O projeto também já nasce com uma visão de expansão, então a base técnica tenta evitar decisões muito específicas demais para um único instrumento, mesmo que o foco atual seja baixo.

## Objetivos

O objetivo do projeto é concentrar em um só lugar as tarefas mais importantes do estudo individual de baixo:

1. Treinar leitura e ritmo.
2. Estudar teoria musical e escalas.
3. Visualizar o braço do instrumento e ouvir notas específicas.
4. Registrar progresso, prática e histórico.
5. Importar, criar e revisar tablaturas e partituras próprias.

Na prática, o app quer funcionar como uma plataforma pessoal de estudo, com módulos que se complementam entre si.

## Quem ele quer atender

O público principal é o estudante de baixo que estuda de forma disciplinada e quer um ambiente organizado para treinar leitura, revisar teoria e acompanhar evolução. O projeto também serve bem para quem usa métodos tradicionais de ensino e precisa de uma ferramenta que una material de estudo, prática guiada e registro de rotina.

Ele pode atender também quem precisa de uma base local para exercícios e anotações musicais sem depender de serviços online.

## Funcionalidades do projeto

### O que já está funcionando hoje

- Navegação entre módulos pela barra lateral.
- Módulo de leitura e ritmo com duas experiências ativas:
  - modo livre para identificar notas;
  - modo tap para treino rítmico com metrônomo e cursor externo.
- Renderização de notação com AlphaTab.
- Reprodução de notas com Web Audio API usando oscilador senoidal.
- Braço virtual do baixo com clique por corda e traste.
- Cálculo de notas, frequências, MIDI e equivalências enarmônicas na camada de engine.
- Lógica pura e testável para leitura, ritmo, áudio e utilitários musicais.

### O que existe, mas ainda está parcial ou em construção

- Módulo de teoria e escalas: hoje ele funciona mais como demonstração do braço virtual do que como área completa de teoria.
- Módulos de progresso, partituras e diário de prática: existem como telas, mas ainda exibem placeholders.
- Banco de dados local: a camada de inicialização já existe, mas ainda não está conectada às telas e fluxos principais.
- Integração completa com importação, biblioteca e edição de tablaturas: ainda não foi implementada.
- Escuta real do instrumento via microfone: está apenas prevista para o futuro.

### O que ainda não foi implementado

- Progresso persistente com histórico real.
- Diário de prática com registros salvos.
- Biblioteca de partituras e tablaturas com importação de arquivos.
- Editor de alphaTex para criação de frases e exercícios.
- Conteúdo teórico completo com revisão e confirmação de conteúdo.
- Entrada por microfone e detecção de pitch.
- Configuração completa de instrumento, como quantidade de cordas e afinação.
- Variações mais avançadas dos modos de leitura e ritmo, como leitura cronometrada e ditado.

## Pontos fortes

O projeto tem uma base boa porque separa a lógica musical da interface. Isso já aparece na organização entre components, engine, store e pages. As rotas de cálculo de nota, tempo e áudio estão testadas e isoladas, o que facilita crescer sem quebrar tudo.

Outro ponto forte é a direção clara de produto: o app não tenta ser uma solução genérica de música, mas uma ferramenta de estudo orientada a baixo, com módulos que dialogam entre si.

## Pontos fracos e limites do que ele se propõe a fazer

O principal limite é que o escopo ainda é maior do que a implementação atual. A visão do produto já inclui progresso, biblioteca, editor, diário e futura escuta do instrumento, mas boa parte disso ainda não saiu do papel.

Também existe uma limitação importante de foco: o projeto é voltado para estudo e organização, não para substituir um DAW, um editor profissional de partituras ou um sistema completo de acompanhamento pedagógico com backend. Ele não se propõe a resolver tudo em tempo real nem a ser uma plataforma online multiusuário.

Outro ponto fraco, no estado atual, é que algumas decisões ainda estão muito amarradas ao baixo de 4 cordas. O desenho da arquitetura sugere que isso deve ser genérico no futuro, mas a implementação corrente ainda é bem centrada nesse cenário.

## Arquitetura de software

A arquitetura segue uma divisão em camadas.

1. A camada de interface fica em React e organiza as telas por módulos.
2. A camada de domínio musical concentra a lógica pura de notas, leitura, ritmo e teoria.
3. A camada de áudio cuida da síntese senoidal e dos cliques do metrônomo.
4. A camada de persistência prepara o uso de SQLite local via Tauri.
5. A camada de notação usa AlphaTab para renderização e, no futuro, criação e importação de partituras.

Na prática, isso significa que a interface dispara as ações, a engine calcula o que precisa acontecer, o áudio reproduz o resultado e o banco de dados vai guardar o histórico quando os módulos de progresso e prática estiverem ligados.

## Como as principais pastas se interligam

### `src/App.tsx`

É o ponto de entrada visual do app. Ele monta a sidebar, escolhe o módulo ativo e renderiza a página correspondente.

### `src/store/useAppStore.ts`

Guarda o estado global da navegação atual. Hoje ele controla qual módulo está aberto.

### `src/pages/`

Contém as telas de cada área funcional do app.

- `ReadingAndRhythm.tsx` concentra o módulo mais maduro hoje.
- `TheoryAndScales.tsx` já expõe o braço virtual, mas ainda não é uma área completa de teoria.
- `Progress.tsx`, `Scores.tsx` e `PracticeDiary.tsx` são páginas estruturadas, porém ainda com placeholder.
- `ModulePlaceholder.tsx` padroniza as seções ainda não implementadas.

### `src/components/`

Guarda componentes reutilizáveis de interface.

- `Notation.tsx` renderiza partitura com AlphaTab.
- `RhythmStaff.tsx` renderiza o cursor externo do exercício rítmico.
- `TapMode.tsx` concentra o treino de tempo e avaliação de taps.
- `Fretboard.tsx` mostra o braço do baixo e dispara a reprodução das notas.

### `src/engine/`

É onde mora a lógica musical pura.

- `note-utils.ts` resolve notas, oitavas, MIDI e posições no braço.
- `audio-engine.ts` converte notas em frequência e toca áudio.
- `reading-engine.ts` controla o modo de leitura livre.
- `rhythm-engine.ts` calcula tempos, padrões rítmicos e classificação dos taps.
- `music-engine.ts` já existe como base para a futura camada de teoria mais ampla.

### `src/db/`

Centraliza a persistência local. Hoje ela prepara a conexão com SQLite, mas ainda precisa ser ligada aos fluxos reais do app.

### `src-tauri/`

Contém a base desktop do aplicativo, incluindo a configuração do Tauri e a ponte com a parte nativa.

## Resumo do estado atual

O projeto já tem uma fundação boa para a fase inicial: navegação, leitura rítmica, notação, áudio e braço virtual estão presentes. Ao mesmo tempo, as áreas mais ambiciosas ainda estão no estágio de estrutura ou placeholder.

Em outras palavras: a direção do produto está clara, a base técnica está organizada, mas a maior parte da visão de longo prazo ainda precisa ser implementada.