/**
 * Conteúdo teórico original do Módulo 2 (sub-etapa 2.4) — transcrição LITERAL e
 * type-safe de docs/theory-content-source.md (fonte de verdade da prosa, escrita
 * pelo usuário; não resumir/reescrever aqui). O texto é FIXO por tipo — os dados
 * que variam por tônica (notas, campo harmônico) são dinâmicos e já vêm do motor
 * na seção Prática da tela.
 *
 * Fonte única: esta estrutura tipada. O campo `body` persistido no banco é GERADO
 * dela (sectionsToBody), nunca o contrário — não existe parser de volta.
 */

import type { ModeId } from "../engine/theory-engine";

/** Os 12 tipos de escala com conteúdo (= valores do seletor da tela Teoria e Escalas). */
export type TheoryTopicId =
  | "major"
  | "naturalMinor"
  | ModeId
  | "majorPentatonic"
  | "minorPentatonic"
  | "blues";

export interface TheoryContentSections {
  formula: string;
  whatItIs: string;
  character: string;
  context: string;
  comparison: string;
  bassApplication: string;
  /** Opcional na fonte — omitida quando o usuário não escreveu. */
  curiosity?: string;
}

export interface TheoryContent {
  title: string;
  sections: TheoryContentSections;
}

/** Ordem canônica das seções (mesma do arquivo fonte). */
export const THEORY_SECTION_ORDER: (keyof TheoryContentSections)[] = [
  "formula",
  "whatItIs",
  "character",
  "context",
  "comparison",
  "bassApplication",
  "curiosity",
];

export const THEORY_SECTION_LABELS: Record<keyof TheoryContentSections, string> = {
  formula: "Fórmula intervalar",
  whatItIs: "O que é / de onde vem",
  character: "Caráter sonoro",
  context: "Onde aparece / contexto de uso",
  comparison: "Comparação com vizinhos próximos",
  bassApplication: "Aplicação prática no baixo",
  curiosity: "Nota histórica/curiosidade",
};

/**
 * Serialização do conteúdo pro campo `body` do ContentEntry (Central de Conteúdo,
 * Módulo 3.4): markdown-like igual ao arquivo fonte, determinística. Seções na ordem
 * canônica; `curiosity` só quando presente.
 */
export function sectionsToBody(sections: TheoryContentSections): string {
  const parts: string[] = [];
  for (const key of THEORY_SECTION_ORDER) {
    const text = sections[key];
    if (!text) continue;
    parts.push(`**${THEORY_SECTION_LABELS[key]}:**\n${text}`);
  }
  return parts.join("\n\n");
}

export const THEORY_CONTENT: Record<TheoryTopicId, TheoryContent> = {
  major: {
    title: "Escala maior",
    sections: {
      formula: "1 - 2 - 3 - 4 - 5 - 6 - 7",
      whatItIs:
        'A escala maior é a base central de toda a música tonal ocidental. Ela estabelece o "centro de gravidade" de uma música (a tônica) e serve como a régua de medição padrão contra a qual todos os outros acordes e escalas são comparados.',
      character:
        'Costuma soar brilhante, estável e conclusiva. Frequente associada a sensações de alegria, triunfo ou resolução, ela transmite uma percepção de "estar em casa", sem grandes conflitos harmônicos.',
      context:
        "É onipresente. Forma a base da imensa maioria das melodias e progressões em estilos como pop, rock, música sertaneja, folk e música erudita.",
      comparison:
        "Comparada ao modo Lídio, a escala maior possui uma 4ª justa (em vez de uma 4ª aumentada). Em relação ao Mixolídio, a escala maior apresenta uma 7ª maior (em vez de uma 7ª menor).",
      bassApplication:
        'É fundamental para construir linhas de baixo "caminhantes" (walking bass) sobre acordes maiores e para desenhar as tríades básicas (1-3-5). No braço do baixo, a digitação mais tradicional abrange três cordas e um espaço de quatro trastes, utilizando o dedo médio na tônica para evitar grandes saltos.',
      curiosity:
        "Quando dizemos que um intervalo possui uma alteração (como bemol ou sustenido), estamos assumindo que a fórmula natural (1 2 3 4 5 6 7) da escala maior é o ponto de partida original.",
    },
  },
  naturalMinor: {
    title: "Menor natural",
    sections: {
      formula: "1 - 2 - b3 - 4 - 5 - b6 - b7",
      whatItIs:
        "A escala menor natural é estruturalmente derivada da escala maior, partindo do seu 6º grau (formando o que chamamos de relativa menor). Ela possui exatamente as mesmas notas de sua relativa maior, mas organiza a música ao redor de um novo centro tonal, criando uma sonoridade totalmente diferente.",
      character:
        "Frequentemente é percebida como melancólica, dramática ou introspectiva. A presença da 3ª menor e da 6ª menor cria uma sensação de tensão contida e escuridão, contrastando fortemente com a luminosidade da escala maior.",
      context:
        "Extensamente utilizada no rock, heavy metal, música eletrônica e em baladas pop. É a escolha primária para criar atmosferas pesadas, tristes ou épicas.",
      comparison:
        'A menor natural é exatamente a mesma estrutura do modo Eólio. Quando comparada ao modo Dórico, a diferença principal é que a menor natural possui a 6ª menor (b6), o que a torna sonoramente mais "fechada" do que a 6ª maior do Dórico.',
      bassApplication:
        "Geralmente iniciada com o dedo indicador na tônica, permitindo uma digitação confortável através das cordas. Linhas de baixo em tons menores costumam ancorar-se solidamente nos graus 1, b3 e 5 para garantir o peso dramático da harmonia sem ambiguidades.",
    },
  },
  ionian: {
    title: "Modo Jônio",
    sections: {
      formula: "1 - 2 - 3 - 4 - 5 - 6 - 7",
      whatItIs:
        "O modo Jônio é simplesmente o nome modal da escala maior. Trata-se da mesma sequência de notas e intervalos, mas analisada sob a ótica dos modos gregos (sendo o primeiro modo, gerado a partir do 1º grau).",
      character:
        "Compartilha o exato mesmo caráter brilhante, consonante e resolvido da escala maior. Transmite clareza e estabilidade totais.",
      context:
        "Utilizado quando a música está repousando de forma estática sobre um acorde maior puro (como um Xmaj7), muito comum no jazz, música modal, pop e folk.",
      comparison:
        "Difere do modo Lídio por possuir uma 4ª justa (o Lídio tem a 4ª aumentada). Difere do modo Mixolídio por manter a 7ª maior original (o Mixolídio tem a 7ª menor).",
      bassApplication:
        "É tocado e aplicado da mesma maneira que a escala maior clássica. Em um contexto modal (como improvisar sobre um acorde estático), o baixista focará em delinear as notas do acorde (1, 3, 5, 7) e usar os outros graus da escala como notas de passagem coloridas.",
    },
  },
  dorian: {
    title: "Modo Dórico",
    sections: {
      formula: "1 - 2 - b3 - 4 - 5 - 6 - b7",
      whatItIs:
        "O Dórico é o segundo modo da escala maior. Apesar de ser um modo de natureza menor (pois possui a 3ª menor), ele traz uma característica especial que o impede de soar tão trágico ou tenso quanto a menor natural.",
      character:
        'Costuma soar sofisticado, noturno e flutuante. A combinação da base menor com uma 6ª maior retira a carga de melancolia da escala, criando um clima "cool", equilibrado e elegante.',
      context:
        'É um dos pilares do jazz modal (a música "So What" de Miles Davis é o exemplo clássico), e extremamente presente no funk, soul, R&B e no fusion.',
      comparison:
        "A única diferença entre o Dórico e a menor natural (Eólio) está no 6º grau. Enquanto a menor natural possui uma 6ª menor (b6), o Dórico ostenta uma 6ª maior (6) natural.",
      bassApplication:
        'É a principal "ferramenta de trabalho" de baixistas de funk e R&B. O intervalo entre a 6ª natural e a 7ª menor (b7) é perfeito para criar linhas de baixo rítmicas e cheias de "groove" sobre acordes menores com sétima (m7).',
    },
  },
  phrygian: {
    title: "Modo Frígio",
    sections: {
      formula: "1 - b2 - b3 - 4 - 5 - b6 - b7",
      whatItIs:
        "É o terceiro modo da escala maior. Ele é um modo de qualidade menor que se destaca por introduzir uma tensão drástica logo no primeiro passo: um intervalo de semitom imediato após a tônica.",
      character:
        'Frequentemente descrito como exótico, tenso e sombrio. A presença da 2ª menor (b2) cria uma dissonância que "empurra" o ouvinte de volta para a tônica, evocando uma sonoridade que lembra fortemente a música flamenca e árabe.',
      context:
        "Muito associado ao flamenco tradicional espanhol. No contexto contemporâneo, é uma ferramenta essencial no heavy metal e em trilhas sonoras cinematográficas para construir riffs agressivos ou momentos de grande tensão.",
      comparison:
        "Distingue-se da escala menor natural (Eólio) por um único intervalo: o Frígio possui a 2ª menor (b2), em contraste com a 2ª maior do Eólio.",
      bassApplication:
        'No heavy metal, é extremamente comum utilizar a corda solta do baixo como tônica e pressionar a primeira casa (o grau b2) para criar riffs "cavalgados" e pesados. A resolução rápida de b2 para 1 é um dos movimentos mais poderosos neste modo.',
    },
  },
  lydian: {
    title: "Modo Lídio",
    sections: {
      formula: "1 - 2 - 3 - #4 - 5 - 6 - 7",
      whatItIs:
        "O Lídio é o quarto modo da escala maior. Ele é um modo maior que altera um de seus intervalos para eliminar a leve dissonância que normalmente existe entre a 3ª e a 4ª justa, criando uma sonoridade totalmente aberta.",
      character:
        'Costuma ser associado a sensações de sonho, fantasia, mistério e flutuação. Por não ter a resolução tradicional da 4ª justa, ele soa como se estivesse "pairando no ar" sem a necessidade urgente de aterrissar.',
      context:
        "Fortemente explorado em trilhas de cinema de ficção científica ou magia, além de ter presença garantida no jazz contemporâneo e no rock progressivo.",
      comparison:
        "Quando comparado à escala maior natural (Jônio), a diferença é exclusiva no 4º grau: o Lídio utiliza uma 4ª aumentada (#4), enquanto a maior utiliza a 4ª justa.",
      bassApplication:
        'Ao criar linhas sobre acordes maiores onde se deseja um clima "moderno" ou espacial, o baixista pode usar a nota #4 como tensão melódica. Ela harmoniza perfeitamente com a 3ª maior do acorde subjacente, sem "bater de frente" com ela.',
    },
  },
  mixolydian: {
    title: "Modo Mixolídio",
    sections: {
      formula: "1 - 2 - 3 - 4 - 5 - 6 - b7",
      whatItIs:
        'O Mixolídio é o quinto modo da escala maior. Ele une a característica alegre de um acorde maior com o "peso" de uma sétima menor, gerando o que chamamos de som "dominante".',
      character:
        "Frequentemente soa enérgico, direto, bluesy e com um forte impulso direcional. A convivência da 3ª maior com a 7ª menor cria um trítono implícito na escala, o que gera uma tensão rítmica que pede movimento.",
      context:
        "É a base absoluta do blues, do rock and roll clássico, do country e de quase toda música que se baseia em acordes maiores com sétima menor (X7).",
      comparison:
        "Comparando-o com a escala maior comum (Jônio), o Mixolídio difere unicamente por possuir uma 7ª menor (b7) no lugar da 7ª maior.",
      bassApplication:
        "É possivelmente a escala mais utilizada por baixistas de música popular. A união da tríade maior com a 7ª menor (1 - 3 - 5 - b7) forma a espinha dorsal de inúmeros padrões de walking bass e linhas de blues que impulsionam a banda para a frente.",
    },
  },
  aeolian: {
    title: "Modo Eólio",
    sections: {
      formula: "1 - 2 - b3 - 4 - 5 - b6 - b7",
      whatItIs:
        "O modo Eólio é o sexto modo da escala maior. Do ponto de vista prático e estrutural, ele é exatamente a mesma coisa que a escala menor natural, apenas tratada com sua nomenclatura modal.",
      character:
        "Como compartilha o esqueleto da menor natural, transmite emoções similares: tristeza, introspecção, epicidade ou peso, dependendo do andamento e da intenção do músico.",
      context:
        "Aparece em quase todo gênero moderno que utilize progressões menores. Muito focado na música pop, folk, metal e temas eruditos de caráter dramático.",
      comparison:
        'Em comparação ao modo Dórico, o modo Eólio possui a 6ª menor (b6), que "puxa" a audição para baixo em direção à 5ª justa, ao invés da 6ª natural mais amena encontrada no Dórico.',
      bassApplication:
        "A aplicação é a mesma da escala menor natural. O baixista deve ter consciência do 6º grau (b6), pois ele é a nota mais sensível da escala; apoiá-la demais sem intenção pode sobrecarregar a harmonia com muita tensão obscura.",
    },
  },
  locrian: {
    title: "Modo Lócrio",
    sections: {
      formula: "1 - b2 - b3 - 4 - b5 - b6 - b7",
      whatItIs:
        "O sétimo e último modo da escala maior. É um modo único por ser o único entre os sete a não possuir uma 5ª justa em sua base, sendo sustentado por uma 5ª diminuta.",
      character:
        'Extremamente instável, áspero e não resolvido. A ausência de uma 5ª justa remove o "chão" da escala, fazendo com que o ouvido perceba esse modo sempre como um ponto de passagem urgente, nunca um lugar de repouso.',
      context:
        "Raramente é utilizado como centro tonal de uma música inteira. Na maior parte do tempo, surge no jazz ou na bossa nova, sendo tocado sobre acordes meio-diminutos (m7b5) durante passagens harmônicas (especialmente o grau ii de uma progressão ii - V - i menor).",
      comparison:
        "A única diferença estrutural entre o Lócrio e o modo Frígio é o 5º grau. O Frígio possui a 5ª justa, enquanto o Lócrio a reduz para uma 5ª diminuta (b5).",
      bassApplication:
        "Diferente dos outros modos, o baixista não pode usar a 5ª justa para estabilizar a base (já que ela não existe aqui). Ao tocar um groove em Lócrio, é vital destacar a raiz e a b5 para comunicar claramente a natureza do acorde meio-diminuto ao resto da banda.",
    },
  },
  majorPentatonic: {
    title: "Pentatônica maior",
    sections: {
      formula: "1 - 2 - 3 - 5 - 6",
      whatItIs:
        "É uma escala de cinco notas (penta) formada a partir da escala maior, com a remoção intencional do 4º e do 7º grau. Essa remoção estratégica elimina todos os intervalos de semitom (os mais tensos) da escala.",
      character:
        "Mundialmente percebida como doce, alegre e totalmente consonante. Por não possuir semitons, quase qualquer nota soa agradável em qualquer ordem, criando melodias redondas e sem atritos.",
      context:
        "É profundamente enraizada na música folclórica mundial, na música gospel, no country, pop contemporâneo e rock sulista.",
      comparison:
        "Ela guarda uma relação íntima com a pentatônica menor relativa. Assim como as escalas naturais, a pentatônica maior de um tom compartilha as exatas mesmas notas da pentatônica menor localizada um tom e meio abaixo.",
      bassApplication:
        'É a escolha mais segura e musical para realizar "fills" (frases de preenchimento) rápidos em músicas maiores. A digitação clássica em "bloco" ou "caixa" no braço do baixo ocupa de três a quatro trastes, permitindo movimentos ágeis sem mudar a posição da mão esquerda.',
    },
  },
  minorPentatonic: {
    title: "Pentatônica menor",
    sections: {
      formula: "1 - b3 - 4 - 5 - b7",
      whatItIs:
        "Uma escala de cinco notas derivada da menor natural pela remoção dos graus 2 e 6. Assim como na pentatônica maior, essa filtragem cria uma versão mais rústica e menos densa da sonoridade menor.",
      character:
        "Costuma soar direta, incisiva e com atitude. Mantém a identidade menor através da b3 e b7, mas abandona a melancolia profunda da menor natural, ganhando um aspecto mais roqueiro e urbano.",
      context:
        "É indiscutivelmente o material mais utilizado na história da guitarra e do baixo elétrico no rock, hard rock, blues e funk. Muitos dos riffs mais memoráveis da história utilizam apenas estas cinco notas.",
      comparison:
        "Formada exatamente pelas mesmas notas de sua relativa pentatônica maior. Além disso, ela é a base pura da escala blues, precisando de apenas uma nota extra para mudar de categoria.",
      bassApplication:
        'Conhecer a digitação básica (frequentemente chamada de "shape 1") da pentatônica menor é obrigatório para qualquer baixista. Ela se encaixa perfeitamente debaixo dos dedos, sendo ideal para construir linhas de baixo agressivas ou improvisar grooves contínuos e cíclicos.',
    },
  },
  blues: {
    title: "Escala blues",
    sections: {
      formula: "1 - b3 - 4 - #4 - 5 - b7",
      whatItIs:
        'É, em sua essência, a pentatônica menor acrescida de apenas uma nota: a famosa "blue note", posicionada cromaticamente entre o 4º e o 5º grau. Pedagogicamente documentada aqui como #4 (visando o movimento ascendente de resolução), ela também pode ser vista como b5.',
      character:
        'A blue note injeta um som "sujo", rasgado e altamente expressivo à escala. A dissonância acentuada causa uma sensação parecida com um lamento vocal (um "choro" no instrumento) que implora para se resolver.',
      context:
        "O coração absoluto do gênero blues. Também é essencial no rock, heavy metal (como ferramenta de peso adicional) e na música soul, sendo a escala definitiva para quem busca adicionar atitude a um solo ou riff.",
      comparison:
        "Como mencionado, ela é a pentatônica menor exata, com a mera adição cromática da nota #4/b5.",
      bassApplication:
        'A blue note (o #4) não é uma nota onde o baixista deve "parar" e descansar; ela funciona como um degrau escorregadio. Linhas de baixo eficientes usam a blue note rapidamente como uma nota de passagem, deslizando (slide) em direção ao 5º ou 4º grau para criar "swing" e peso na pulsação.',
    },
  },
};
