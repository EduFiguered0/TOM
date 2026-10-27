export type RejectCode =
  | 'forbidden'
  | 'invalid_input'
  | 'round_not_paired'
  | 'round_already_started'
  | 'round_not_started'
  | 'table_not_found'
  | 'not_your_table'
  | 'side_required'
  | 'table_locked'
  | 'not_green'
  | 'key_already_launched'
  | 'concurrency'
  | 'account_exists'
  | 'account_not_found'
  | 'session_conflict'
  | 'session_inactive'
  | 'player_id_taken'
  | 'player_id_set'
  | 'name_reviewed'
  | 'invalid_token'
  | 'tournament_mismatch'
  | 'event_not_found'
  | 'event_active'
  | 'event_state';

/** Comando recusado por regra de negócio; nada foi gravado. */
export class CommandRejected extends Error {
  override name = 'CommandRejected';

  constructor(
    readonly code: RejectCode,
    message: string,
  ) {
    super(message);
  }
}
