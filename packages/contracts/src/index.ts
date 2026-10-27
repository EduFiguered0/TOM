/** Formato das requisições e respostas da API, compartilhado entre API e telas. Sem dependências. */

export interface ProfileDto {
  firstName: string;
  lastName: string;
  birthYear: number;
  phone: string | null;
  guardianConsent: boolean;
}

export interface RegisterRequest {
  profile: ProfileDto;
  /** Player ID informado pelo jogador; vale desde o cadastro (o primeiro a cadastrar fica com ele). */
  playerId: string | null;
}

export interface SessionRequest {
  /** true quando o jogador confirmou na tela que este dispositivo substitui o outro. */
  replace: boolean;
}

/** Conta sem Player ID informa depois. */
export interface PlayerIdRequest {
  playerId: string;
}

/** Conta antiga confere o nome separado automaticamente. */
export interface NameRequest {
  firstName: string;
  lastName: string;
}

/** Nome completo para exibir; sem espaço sobrando quando o sobrenome está vazio (dado antigo). */
export const displayName = ({ firstName, lastName }: { firstName: string; lastName: string }): string => `${firstName} ${lastName}`.trim();

/** Conta como o ADM vê ao desfazer um vínculo de Player ID. */
export interface AccountResponse {
  id: string;
  email: string;
  profile: ProfileDto;
  playerId: string | null;
  /** Juiz da equipe (marcado pelo ADM). */
  judge: boolean;
  createdAt: string;
}

export interface MeResponse extends AccountResponse {
  /** ADM vem do grupo do Cognito; o juiz é um jogador com a marca da equipe. */
  role: 'player' | 'admin';
  /** false para jogador sem Player ID: vê a conta, mas ainda não reporta. */
  canAct: boolean;
  /** Juiz da equipe. */
  judge: boolean;
  /** Juiz escalado no evento atual: abre o painel. */
  judging: boolean;
  /** false = conta antiga, com o nome separado automaticamente: mostra "Confira seu nome". */
  nameReviewed: boolean;
}

/** Equipe: busca por nome ou Player ID. */
export interface SearchRequest {
  query: string;
}

export interface SetJudgeRequest {
  judge: boolean;
}

/** Juízes escalados no evento (ids de conta). */
export interface JudgesRequest {
  judges: string[];
}

export interface ErrorResponse {
  error: string;
  message: string;
}

export class InvalidRequestError extends Error {
  override name = 'InvalidRequestError';
}

type Json = Record<string, unknown>;

const object = (value: unknown, what: string): Json => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new InvalidRequestError(`${what} deve ser um objeto`);
  return value as Json;
};

interface FieldTypes { string: string; number: number; boolean: boolean }

const field = <K extends keyof FieldTypes>(obj: Json, key: string, type: K): FieldTypes[K] => {
  const value = obj[key];
  if (typeof value === type) return value as FieldTypes[K];
  throw new InvalidRequestError(`Campo "${key}" deve ser ${type}`);
};

const nullableString = (obj: Json, key: string): string | null => (obj[key] === null ? null : field(obj, key, 'string'));

export const parseRegisterRequest = (body: unknown): RegisterRequest => {
  const root = object(body, 'Corpo');
  const profile = object(root['profile'], 'profile');
  return {
    profile: {
      firstName: field(profile, 'firstName', 'string'),
      lastName: field(profile, 'lastName', 'string'),
      birthYear: field(profile, 'birthYear', 'number'),
      phone: nullableString(profile, 'phone'),
      guardianConsent: field(profile, 'guardianConsent', 'boolean'),
    },
    playerId: nullableString(root, 'playerId'),
  };
};

export const parsePlayerIdRequest = (body: unknown): PlayerIdRequest => ({
  playerId: field(object(body, 'Corpo'), 'playerId', 'string'),
});

export const parseNameRequest = (body: unknown): NameRequest => {
  const root = object(body, 'Corpo');
  return { firstName: field(root, 'firstName', 'string'), lastName: field(root, 'lastName', 'string') };
};

export const parseSessionRequest = (body: unknown): SessionRequest => ({
  replace: field(object(body, 'Corpo'), 'replace', 'boolean'),
});

/** Cor do termômetro da mesa (spec, "Termômetro de validação de resultados"). */
export type TableColor = 'gray' | 'orange' | 'green' | 'red';

/** Rodada para a TV do salão: pública, só nomes (sem Player ID nem e-mail). */
/** Rodada na TV: pareamentos e cronômetro. */
export interface RoundBoard {
  tournament: string;
  division: string;
  round: number;
  /** null antes de o ADM iniciar a rodada. */
  startedAt: string | null;
  /** Fim do tempo da rodada (sem acréscimos de mesa). */
  endsAt: string | null;
  /** `result`: só com a mesa verde (vencedor, empate ou derrota dupla); nunca o placar. */
  tables: { table: number; player1: string; player2: string; color: TableColor; result: 'player1' | 'player2' | 'tie' | 'double_loss' | null }[];
  byes: string[];
  /** Momento em que o servidor montou a resposta; a TV corrige o relógio local por ele. */
  serverTime: string;
}

export interface FinalStandingDto {
  division: string;
  rank: number;
  name: string;
  wins: number;
  losses: number;
  ties: number;
  /** Pontos e desempates do TOM (% de vitória dos oponentes e dos oponentes dos oponentes); null em eventos antigos. */
  points: number | null;
  opponentWinPct: number | null;
  opponentsOpponentWinPct: number | null;
}

interface BoardEvent {
  label: string;
  date: string;
}

/** Quadro público da TV por fase do evento; `serverTime` em todas (a TV acerta o relógio). */
export type BoardResponse =
  | { state: 'idle'; serverTime: string }
  | { state: 'open'; event: BoardEvent; code: string; registered: number; serverTime: string }
  /** `code`: o QR continua no canto da TV para quem chega depois da rodada 1. */
  | ({ state: 'running'; code: string } & RoundBoard)
  /** Entre rodadas: o standings intermediário do TOM, até o pareamento seguinte chegar. */
  | { state: 'standings'; event: BoardEvent; round: number; standings: FinalStandingDto[]; serverTime: string }
  | { state: 'final'; event: BoardEvent; standings: FinalStandingDto[]; serverTime: string };

/** Uma versão completa de um HTML do TOM, enviada pelo enviador com o token do evento (cabeçalho `x-upload-token`). */
export interface UploadRequest {
  tournament: string;
  /** Tipo do relatório: match_slips, pairings, standings... */
  report: string;
  fileName: string;
  content: string;
  /** SHA-256 do conteúdo, em hexadecimal; a API confere. */
  sha256: string;
  /** Quando o TOM gravou o arquivo (ISO 8601). */
  modifiedAt: string;
}

export interface UploadResponse {
  /** false = a mesma versão já estava guardada (reenvio). */
  stored: boolean;
  /** Rodadas publicadas a partir deste envio. */
  published: { division: string; round: number }[];
  /** Por que nada foi publicado, quando for o caso (ex.: aguardando as guias da rodada). */
  note: string | null;
}

/** HTMLs do TOM têm poucos KB; o limite protege a API de envios absurdos. */
export const MAX_UPLOAD_CHARS = 2_000_000;

export const parseUploadRequest = (body: unknown): UploadRequest => {
  const root = object(body, 'Corpo');
  const request = {
    tournament: field(root, 'tournament', 'string'),
    report: field(root, 'report', 'string'),
    fileName: field(root, 'fileName', 'string'),
    content: field(root, 'content', 'string'),
    sha256: field(root, 'sha256', 'string'),
    modifiedAt: field(root, 'modifiedAt', 'string'),
  };
  if (request.content.length > MAX_UPLOAD_CHARS) throw new InvalidRequestError('Arquivo grande demais');
  if (Number.isNaN(Date.parse(request.modifiedAt))) throw new InvalidRequestError('modifiedAt deve ser uma data ISO');
  return request;
};

export type EventStatusDto = 'open' | 'running' | 'final' | 'closed' | 'cancelled';

export interface EventDto {
  id: string;
  label: string;
  /** `YYYY-MM-DD`. */
  date: string;
  roundMinutes: number;
  status: EventStatusDto;
  judges: string[];
  /** Código do QR: só nas respostas do ADM (a TV mostra no QR). */
  code?: string;
}

export interface CreateEventRequest {
  label: string;
  /** `YYYY-MM-DD`; ausente = hoje. */
  date?: string;
  /** Ausente = 50 minutos. */
  roundMinutes?: number;
  /** Juízes escalados (ids de conta); ausente = nenhum. */
  judges: string[];
}

export interface UpdateEventRequest {
  roundMinutes?: number;
  judges?: string[];
}

/** O token do enviador só aparece nesta resposta; o servidor guarda apenas o hash. */
export interface CreateEventResponse {
  id: string;
  label: string;
  token: string;
  event: EventDto;
}

/** Evento ativo para o painel do ADM; null sem evento ativo. */
export interface ActiveEventResponse {
  event: EventDto | null;
  /** Sem evento ativo: o último evento, para reexibir a classificação final na TV. */
  last: { id: string; label: string; date: string; onTv: boolean; canShow: boolean } | null;
}

export interface ShowOnTvRequest {
  on: boolean;
}

export interface RegistrationDto {
  accountId: string;
  playerId: string;
  firstName: string;
  lastName: string;
  birthYear: number;
  /** ISO 8601. */
  at: string;
  by: 'self' | 'admin';
  /** Entrou pelo QR depois do início da rodada 1 e espera o ADM aprovar. */
  awaitingApproval: boolean;
  launched: boolean;
  removed: boolean;
  /** Pagou (o ADM marca); só vai para o ADM. */
  paid: boolean;
  /** Está nas guias da rodada atual deste evento; null antes de o TOM publicar uma rodada. */
  inRound: boolean | null;
}

/** Painel de inscritos; `total` e `launched` não contam os removidos nem quem aguarda aprovação. */
export interface RegistrationsResponse {
  registrations: RegistrationDto[];
  total: number;
  /** Entradas tardias esperando o ADM. */
  awaiting: number;
  launched: number;
  /** Inscritos (sem removidos e sem quem aguarda) que pagaram. */
  paid: number;
}

/** A própria inscrição, como o jogador vê: sem o pagamento (só o ADM vê). */
export type MyRegistrationDto = Omit<RegistrationDto, 'paid'>;

/** Linha da guia Jogadores, mascarada no servidor: o ADM reconhece a pessoa sem receber e-mail, telefone ou sobrenome. */
export interface PlayerRowDto {
  id: string;
  playerId: string | null;
  /** Só o primeiro nome. */
  firstName: string;
  /** `duk•••@gmail.com`. */
  email: string;
  /** `•••• 1234`; null sem telefone. */
  phone: string | null;
}

/** Conta na guia Equipe (busca, juízes, escala): mascarada como na guia Jogadores, com a marca de juiz. */
export type TeamMemberDto = PlayerRowDto & { judge: boolean };

/** Convite de juiz aberto (o QR leva a `/juiz/<código>`). */
export interface InviteDto {
  code: string;
  /** ISO 8601. */
  expiresAt: string;
}

/** Um evento no cadastro do jogador (só o ADM vê). */
export interface PlayerEventDto {
  eventId: string;
  label: string;
  /** `YYYY-MM-DD`. */
  date: string;
  paid: boolean;
}

export interface SetPaidRequest {
  paid: boolean;
}

/** Evento ativo e a inscrição da própria conta; os dois null sem evento ativo. */
export interface MyEventResponse {
  event: EventDto | null;
  registration: MyRegistrationDto | null;
  /** Colocação final do jogador (quando o TOM mandou os standings da última rodada); null antes ou se não jogou. */
  placement: { rank: number; total: number; wins: number; losses: number; ties: number; points: number | null } | null;
}

export interface JoinResponse {
  event: EventDto;
  registration: MyRegistrationDto;
}

export interface AddRegistrationRequest {
  accountId: string;
}

export interface SetLaunchedRequest {
  launched: boolean;
}

const MAX_JUDGES = 20;

const judgeList = (obj: Json): string[] => {
  const value = obj['judges'];
  if (!Array.isArray(value) || value.length > MAX_JUDGES || value.some((v) => typeof v !== 'string')) {
    throw new InvalidRequestError(`Campo "judges" deve ser uma lista de até ${String(MAX_JUDGES)} textos`);
  }
  return value as string[];
};

const optionalNumber = (obj: Json, key: string): number | undefined => (obj[key] === undefined ? undefined : field(obj, key, 'number'));

export const parseCreateEventRequest = (body: unknown): CreateEventRequest => {
  const root = object(body, 'Corpo');
  const date = root['date'] === undefined ? undefined : field(root, 'date', 'string');
  const roundMinutes = optionalNumber(root, 'roundMinutes');
  return {
    label: field(root, 'label', 'string'),
    ...(date === undefined ? {} : { date }),
    ...(roundMinutes === undefined ? {} : { roundMinutes }),
    judges: root['judges'] === undefined ? [] : judgeList(root),
  };
};

export const parseUpdateEventRequest = (body: unknown): UpdateEventRequest => {
  const root = object(body, 'Corpo');
  const roundMinutes = optionalNumber(root, 'roundMinutes');
  return { ...(roundMinutes === undefined ? {} : { roundMinutes }), ...(root['judges'] === undefined ? {} : { judges: judgeList(root) }) };
};

export const parseAddRegistrationRequest = (body: unknown): AddRegistrationRequest => ({ accountId: field(object(body, 'Corpo'), 'accountId', 'string') });

export const parseSetLaunchedRequest = (body: unknown): SetLaunchedRequest => ({ launched: field(object(body, 'Corpo'), 'launched', 'boolean') });

export const parseSetPaidRequest = (body: unknown): SetPaidRequest => ({ paid: field(object(body, 'Corpo'), 'paid', 'boolean') });

export const parseShowOnTvRequest = (body: unknown): ShowOnTvRequest => ({ on: field(object(body, 'Corpo'), 'on', 'boolean') });

export const parseJudgesRequest = (body: unknown): JudgesRequest => ({ judges: judgeList(object(body, 'Corpo')) });

export const parseSearchRequest = (body: unknown): SearchRequest => ({ query: field(object(body, 'Corpo'), 'query', 'string') });

export const parseSetJudgeRequest = (body: unknown): SetJudgeRequest => ({ judge: field(object(body, 'Corpo'), 'judge', 'boolean') });

/** Reporte do jogador, do ponto de vista dele: placar de games ou intentional draw (ID). */
export type ReportDto = { kind: 'score'; own: number; opponent: number } | { kind: 'intentional_draw' };

export type RedReasonDto = 'outcome_conflict' | 'score_mismatch' | 'timeout';

/** Onde o jogador está na rodada atual. */
export type SeatDto =
  | { kind: 'not_checked_in' }
  /** Fora das mesas: bye (o TOM não traz Player ID no bye) ou não inscrito. */
  | { kind: 'not_paired' }
  | {
      kind: 'table';
      table: number;
      opponent: string;
      /** Prazo desta mesa (rodada + acréscimo); null antes de a rodada começar. */
      deadline: string | null;
      color: TableColor;
      redReason: RedReasonDto | null;
      myReport: ReportDto | null;
      /** O placar do oponente não é mostrado: ninguém copia o reporte do outro. */
      opponentReported: boolean;
      /** Verde ou key lançada: o jogador não corrige mais (só juiz/ADM). */
      locked: boolean;
    };

export interface MyRoundResponse {
  round: {
    tournament: string;
    division: string;
    round: number;
    bestOf: 1 | 3 | null;
    startedAt: string | null;
    seat: SeatDto;
  } | null;
  serverTime: string;
}

export interface ReportRequest {
  report: ReportDto;
}

export interface StartRoundRequest {
  bestOf: 1 | 3;
  /** null = tempo do evento (padrão: 50 minutos). */
  roundMinutes: number | null;
}

export const parseReportRequest = (body: unknown): ReportRequest => {
  const report = object(object(body, 'Corpo')['report'], 'report');
  const kind = field(report, 'kind', 'string');
  if (kind === 'intentional_draw') return { report: { kind } };
  if (kind !== 'score') throw new InvalidRequestError('report.kind deve ser score ou intentional_draw');
  return { report: { kind, own: field(report, 'own', 'number'), opponent: field(report, 'opponent', 'number') } };
};

export const parseStartRoundRequest = (body: unknown): StartRoundRequest => {
  const root = object(body, 'Corpo');
  const bestOf = field(root, 'bestOf', 'number');
  if (bestOf !== 1 && bestOf !== 3) throw new InvalidRequestError('bestOf deve ser 1 ou 3');
  const minutes = root['roundMinutes'] === null || root['roundMinutes'] === undefined ? null : field(root, 'roundMinutes', 'number');
  return { bestOf, roundMinutes: minutes };
};

export type OverrideDto =
  | { kind: 'score'; player1: number; player2: number }
  | { kind: 'intentional_draw' }
  | { kind: 'double_game_loss' }
  | { kind: 'win_by_absence'; winner: 'player1' | 'player2' };

export interface PanelTable {
  table: number;
  player1: { name: string; playerId: string };
  player2: { name: string; playerId: string };
  color: TableColor;
  redReason: RedReasonDto | null;
  reports: { player1: ReportDto | null; player2: ReportDto | null };
  override: { override: OverrideDto; reason: string; by: string; at: string } | null;
  extraMinutes: number;
  deadline: string | null;
  /** Key a lançar no TOM (mesa verde). null: sem resultado ainda, ou DGL (lançado à mão no TOM). */
  tomKey: { label: string; code: string } | null;
  keyLaunched: boolean;
}

/** Painel da organização: tudo da rodada atual, inclusive Player IDs, reportes e keys. */
export interface PanelResponse {
  round: {
    tournament: string;
    division: string;
    round: number;
    bestOf: 1 | 3 | null;
    roundMinutes: number | null;
    startedAt: string | null;
    tables: PanelTable[];
    byes: string[];
    counts: Record<TableColor, number>;
    allGreen: boolean;
    /** Todas as keys lançadas: a próxima rodada pode começar. */
    closed: boolean;
  } | null;
  /** Rodada mais recente publicada pelo TOM (as abas vão de 1 até ela). */
  latestRound: number | null;
  /** Rodadas anteriores iniciadas no site com mesas sem key lançada: aviso, não trava a próxima. */
  pendingKeys: { round: number; tables: number[] }[];
  serverTime: string;
}

export interface OverrideRequest { override: OverrideDto; reason: string }
export interface ExtendRequest { minutes: number }
export interface StaffReportRequest { side: 'player1' | 'player2'; report: ReportDto }

const side = (value: string): 'player1' | 'player2' => {
  if (value !== 'player1' && value !== 'player2') throw new InvalidRequestError('Lado deve ser player1 ou player2');
  return value;
};

export const parseOverrideRequest = (body: unknown): OverrideRequest => {
  const root = object(body, 'Corpo');
  const o = object(root['override'], 'override');
  const kind = field(o, 'kind', 'string');
  // Motivo opcional: ausente vira vazio.
  const reason = root['reason'] === undefined ? '' : field(root, 'reason', 'string');
  switch (kind) {
    case 'score': return { reason, override: { kind, player1: field(o, 'player1', 'number'), player2: field(o, 'player2', 'number') } };
    case 'intentional_draw':
    case 'double_game_loss': return { reason, override: { kind } };
    case 'win_by_absence': return { reason, override: { kind, winner: side(field(o, 'winner', 'string')) } };
    default: throw new InvalidRequestError('override.kind inválido');
  }
};

export const parseExtendRequest = (body: unknown): ExtendRequest => ({ minutes: field(object(body, 'Corpo'), 'minutes', 'number') });

export const parseStaffReportRequest = (body: unknown): StaffReportRequest => ({
  side: side(field(object(body, 'Corpo'), 'side', 'string')),
  report: parseReportRequest(body).report,
});
