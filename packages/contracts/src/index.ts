/** Formato das requisições e respostas da API, compartilhado entre API e telas. Sem dependências. */

export interface ProfileDto {
  name: string;
  birthYear: number;
  phone: string | null;
  guardianConsent: boolean;
}

export interface RegisterRequest {
  profile: ProfileDto;
  /** Player ID informado pelo jogador; fica pendente até o ADM confirmar no check-in. */
  playerId: string | null;
}

export interface SessionRequest {
  /** true quando o jogador confirmou na tela que este dispositivo substitui o outro. */
  replace: boolean;
}

export interface ConfirmPlayerIdRequest {
  /** Valor conferido presencialmente; pode corrigir o que o jogador informou. */
  playerId: string;
}

/** Conta como o ADM vê no check-in. */
export interface AccountResponse {
  id: string;
  email: string;
  profile: ProfileDto;
  playerId: { value: string; confirmed: boolean } | null;
  createdAt: string;
}

export interface MeResponse extends AccountResponse {
  role: 'player' | 'judge' | 'admin';
  /** false para jogador sem Player ID confirmado: vê a conta, mas ainda não reporta. */
  canAct: boolean;
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
      name: field(profile, 'name', 'string'),
      birthYear: field(profile, 'birthYear', 'number'),
      phone: nullableString(profile, 'phone'),
      guardianConsent: field(profile, 'guardianConsent', 'boolean'),
    },
    playerId: nullableString(root, 'playerId'),
  };
};

export const parseConfirmPlayerIdRequest = (body: unknown): ConfirmPlayerIdRequest => ({
  playerId: field(object(body, 'Corpo'), 'playerId', 'string'),
});

export const parseSessionRequest = (body: unknown): SessionRequest => ({
  replace: field(object(body, 'Corpo'), 'replace', 'boolean'),
});

/** Cor do termômetro da mesa (spec, "Termômetro de validação de resultados"). */
export type TableColor = 'gray' | 'orange' | 'green' | 'red';

/** Rodada para a TV do salão: pública, só nomes (sem Player ID nem e-mail). */
export interface BoardResponse {
  tournament: string;
  division: string;
  round: number;
  /** null antes de o ADM iniciar a rodada. */
  startedAt: string | null;
  /** Fim do tempo da rodada (sem acréscimos de mesa). */
  endsAt: string | null;
  tables: { table: number; player1: string; player2: string; color: TableColor }[];
  byes: string[];
  /** Momento em que o servidor montou a resposta; a TV corrige o relógio local por ele. */
  serverTime: string;
}

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

export interface CreateEventRequest {
  label: string;
}

/** O token do enviador só aparece nesta resposta; o servidor guarda apenas o hash. */
export interface CreateEventResponse {
  id: string;
  label: string;
  token: string;
}

export const parseCreateEventRequest = (body: unknown): CreateEventRequest => ({
  label: field(object(body, 'Corpo'), 'label', 'string'),
});

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
  /** null = 30 minutos (padrão da spec). */
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
