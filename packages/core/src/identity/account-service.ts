import type { Actor } from '../shared/actor.js';
import { CommandRejected } from '../shared/command-rejected.js';
import { ConcurrencyError } from '../shared/concurrency-error.js';
import { InvalidPlayerIdError, toPlayerId } from '../shared/player-id.js';
import type { Clock, IdGenerator } from '../shared/ports.js';
import { InvalidProfileError, validProfile, type Account, type IdentityEventData, type Profile } from './account.js';
import { PlayerIdTakenError, type AccountRepository } from './account-repository.js';

/** O que o token validado (Cognito) diz sobre quem chama. */
export interface Identity {
  accountId: string;
  /** `origin_jti`: identifica o login neste dispositivo e sobrevive às renovações do token. */
  session: string;
  /** `cognito:groups`. */
  groups: readonly string[];
}

export interface Principal {
  account: Account;
  /** null para jogador sem Player ID confirmado: entra, mas ainda não pode agir. */
  actor: Actor | null;
}

export interface AccountServiceDeps {
  accounts: AccountRepository;
  clock: Clock;
  ids: IdGenerator;
}

const MAX_ATTEMPTS = 3;

const actorFor = (account: Account, groups: readonly string[]): Actor | null => {
  if (groups.includes('admin')) return { role: 'admin', accountId: account.id };
  if (groups.includes('judge')) return { role: 'judge', accountId: account.id };
  return account.playerId?.confirmed ? { role: 'player', accountId: account.id, playerId: account.playerId.value } : null;
};

/** Quem age em nome da própria conta antes de ter papel (cadastro, sessão). */
const self = (id: Identity): Actor => ({ role: 'system', source: `account:${id.accountId}` });

/** Erros de validação do domínio viram recusa do comando. */
const validated = <T>(fn: () => T): T => {
  try {
    return fn();
  } catch (e) {
    if (e instanceof InvalidProfileError || e instanceof InvalidPlayerIdError) throw new CommandRejected('invalid_input', e.message);
    throw e;
  }
};

export class AccountService {
  constructor(private readonly deps: AccountServiceDeps) {}

  /**
   * Cadastro após o primeiro login; o Player ID informado fica pendente até o ADM confirmar.
   * O e-mail vem do Cognito (já verificado), nunca do corpo da requisição.
   */
  async register(identity: Identity, email: string, input: { profile: Profile; playerId: string | null }): Promise<Account> {
    const now = this.deps.clock.now();
    if (await this.deps.accounts.get(identity.accountId)) {
      throw new CommandRejected('account_exists', 'Esta conta já está cadastrada');
    }
    const profile = validated(() => validProfile(input.profile, now));
    const playerId = input.playerId ? validated(() => toPlayerId(input.playerId ?? '')) : null;
    const account: Account = {
      id: identity.accountId,
      email,
      profile,
      playerId: playerId ? { value: playerId, confirmed: false } : null,
      activeSession: identity.session,
      createdAt: now,
    };
    const events: IdentityEventData[] = [
      { type: 'account_registered' },
      ...(playerId ? [{ type: 'player_id_claimed' as const, playerId }] : []),
      { type: 'session_activated', session: identity.session, replaced: null },
    ];
    try {
      await this.deps.accounts.save(account, events.map((e) => this.event(account.id, self(identity), e)), 0);
    } catch (e) {
      if (e instanceof ConcurrencyError) throw new CommandRejected('account_exists', 'Esta conta já está cadastrada');
      throw e;
    }
    return account;
  }

  /**
   * Torna este dispositivo o ativo. No primeiro acesso ativa direto; com outro dispositivo ativo,
   * só troca com `replace` (o jogador confirmou na tela) e o anterior fica revogado.
   */
  activateSession(identity: Identity, replace: boolean): Promise<Account> {
    return this.execute(identity.accountId, (account) => {
      if (account.activeSession === identity.session) return null;
      if (account.activeSession && !replace) {
        throw new CommandRejected('session_conflict', 'Outro dispositivo está ativo; confirme para desconectá-lo');
      }
      return {
        actor: self(identity),
        account: { ...account, activeSession: identity.session },
        data: { type: 'session_activated', session: identity.session, replaced: account.activeSession },
      };
    });
  }

  /** Valida a sessão do token a cada chamada da API e resolve o papel. */
  async authenticate(identity: Identity): Promise<Principal> {
    const account = await this.requireAccount(identity.accountId);
    if (account.activeSession !== identity.session) {
      throw new CommandRejected('session_inactive', 'Este dispositivo foi desconectado; entre de novo para usá-lo');
    }
    return { account, actor: actorFor(account, identity.groups) };
  }

  /** No check-in o ADM confere o Player ID presencialmente; pode corrigir o valor informado. */
  async confirmPlayerId(actor: Actor, accountId: string, playerId: string): Promise<Account> {
    if (actor.role !== 'admin') throw new CommandRejected('forbidden', `Papel ${actor.role} não pode executar esta ação`);
    const value = validated(() => toPlayerId(playerId));
    return this.execute(accountId, async (account) => {
      if (account.playerId?.confirmed && account.playerId.value === value) return null;
      const holder = await this.deps.accounts.findByConfirmedPlayerId(value);
      if (holder && holder.id !== account.id) throw takenRejection(value);
      return {
        actor,
        account: { ...account, playerId: { value, confirmed: true } },
        data: { type: 'player_id_confirmed', playerId: value },
      };
    });
  }

  private async requireAccount(id: string): Promise<Account> {
    const record = await this.deps.accounts.get(id);
    if (!record) throw new CommandRejected('account_not_found', 'Conta não cadastrada');
    return record.account;
  }

  private event(accountId: string, actor: Actor, data: IdentityEventData) {
    return { ...data, id: this.deps.ids.next(), accountId, at: this.deps.clock.now(), actor };
  }

  /** Lê, decide e grava; repete se outra gravação passou na frente. `null` = nada a mudar. */
  private async execute(
    accountId: string,
    decide: (account: Account) => Promise<Change | null> | Change | null,
  ): Promise<Account> {
    for (let attempt = 1; ; attempt++) {
      const record = await this.deps.accounts.get(accountId);
      if (!record) throw new CommandRejected('account_not_found', 'Conta não cadastrada');
      const change = await decide(record.account);
      if (!change) return record.account;
      try {
        await this.deps.accounts.save(change.account, [this.event(accountId, change.actor, change.data)], record.version);
        return change.account;
      } catch (e) {
        if (e instanceof PlayerIdTakenError) throw takenRejection(change.account.playerId?.value ?? '');
        if (!(e instanceof ConcurrencyError)) throw e;
        if (attempt >= MAX_ATTEMPTS) throw new CommandRejected('concurrency', 'Muitas alterações simultâneas; tente de novo');
      }
    }
  }
}

interface Change {
  actor: Actor;
  account: Account;
  data: IdentityEventData;
}

const takenRejection = (playerId: string) =>
  new CommandRejected('player_id_taken', `Player ID ${playerId} já está confirmado em outra conta`);
