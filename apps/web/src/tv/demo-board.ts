import type { BoardResponse, TableColor } from '@tom/contracts';

/** Dados fictícios para aprovar o layout da TV; somem quando a ingestão do TOM (7.2) chegar. */
const NAMES = [
  'Ana Souza', 'Bruno Lima', 'Carla Mendes', 'Diego Rocha', 'Eduarda Alves', 'Felipe Castro', 'Gabriela Nunes', 'Henrique Prado',
  'Isabela Freitas', 'João Pedro Martins', 'Karina Duarte', 'Lucas Barbosa', 'Mariana Teixeira', 'Nicolas Ribeiro', 'Olívia Cardoso',
  'Paulo Henrique Dias', 'Rafaela Moreira', 'Samuel Araújo', 'Tatiane Gomes', 'Ulisses Pereira', 'Vitória Campos', 'Wesley Farias',
  'Yasmin Correia', 'Zeca Monteiro', 'Amanda Vieira', 'Bernardo Pinto', 'Cecília Ramos', 'Davi Moura', 'Elisa Batista',
  'Fábio Nogueira', 'Giovana Lopes', 'Heitor Santana', 'Iara Cavalcanti', 'Júlio Rezende', 'Larissa Fonseca', 'Mateus Coelho',
  'Natália Brito', 'Otávio Siqueira', 'Priscila Andrade', 'Renan Tavares', 'Sabrina Macedo', 'Thiago Viana', 'Valentina Rios',
  'William Paiva', 'Alice Bezerra', 'Caio Salgado', 'Débora Queiroz', 'Enzo Antunes', 'Fernanda Guimarães', 'Gustavo Leal', 'Helena Sales',
];

const COLORS: TableColor[] = ['green', 'green', 'orange', 'gray', 'green', 'red', 'orange', 'green', 'gray', 'green'];

export const demoBoard = (now = Date.now()): BoardResponse => {
  const startedAt = now - 18 * 60_000;
  return {
    tournament: 'Liga Local de Outubro',
    division: 'Divisão Mestre',
    round: 3,
    startedAt: new Date(startedAt).toISOString(),
    endsAt: new Date(startedAt + 30 * 60_000).toISOString(),
    tables: Array.from({ length: 25 }, (_, i) => ({
      table: i + 1,
      player1: NAMES[i * 2] ?? '',
      player2: NAMES[i * 2 + 1] ?? '',
      color: COLORS[i % COLORS.length] ?? 'gray',
    })),
    byes: [NAMES[50] ?? ''],
    serverTime: new Date(now).toISOString(),
  };
};
