import type { Actor } from '../shared/actor.js';
import { CommandRejected } from '../shared/command-rejected.js';
import { ConcurrencyError } from '../shared/concurrency-error.js';
import { InvalidPlayerIdError, toPlayerId } from '../shared/player-id.js';
import type { Clock, IdGenerator } from '../shared/ports.js';
import { InvalidProfileError, normalizeEmail, validProfile, type Account, type IdentityEventData, type Profile } from './account.js';
import { AccountConflictError, PlayerIdTakenError, type AccountRecord, type AccountRepository } from './account-repository.js';

/** O que o token validado (Cognito) diz sobre quem chama. */
export interface Identity {
  /** `sub` do Cognito: um por forma de login (e-mail e senha, Google). */
  login: string;
  /** De onde veio o login; só o Google prova o e-mail. */
  provider: 'password' | 'google';
  /** `origin_jti`: identifica o login neste dispositivo e sobrevive às renovações do token. */
  session: string;
  /** `cognito:groups`. */
  groups: readonly string[];
}

export interface Principal {
  account: Account;
  /** null para jogador sem Player ID: entra, mas ainda não pode agir. */
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
  return account.playerId ? { role: 'player', accountId: account.id, playerId: account.playerId } : null;
};

function requireAdmin(actor: Actor | null): asserts actor is Actor {
  if (actor?.role !== 'admin') throw new CommandRejected('forbidden', 'Só o ADM pode executar esta ação');
}

/** Quem age em nome da própria conta antes de ter papel (cadastro, sessão). */
const self = (id: Identity): Actor => ({ role: 'system', source: `login:${id.login}` });

const notFound = () => new CommandRejected('account_not_found', 'Conta não cadastrada');

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
   * Cadastro após o primeiro login; o Player ID informado já vale (o primeiro a cadastrar fica com ele).
   * O e-mail vem do Cognito, nunca do corpo da requisição.
   */
  async register(identity: Identity, email: string, input: { profile: Profile; playerId: string | null }): Promise<Account> {
    const now = this.deps.clock.now();
    const normalized = normalizeEmail(email);
    if ((await this.deps.accounts.findByLogin(identity.login)) || (await this.deps.accounts.findByEmail(normalized))) {
      throw accountExists();
    }
    const profile = validated(() => validProfile(input.profile, now));
    const playerId = input.playerId ? validated(() => toPlayerId(input.playerId ?? '')) : null;
    const account: Account = {
      id: this.deps.ids.next(),
      email: normalized,
      logins: [identity.login],
      emailProven: identity.provider === 'google',
      profile,
      playerId,
      activeSession: identity.session,
      createdAt: now,
    };
    const events: IdentityEventData[] = [
      { type: 'account_registered', login: identity.login },
      ...(playerId ? [{ type: 'player_id_claimed' as const, playerId }] : []),
      { type: 'session_activated', session: identity.session, replaced: null },
    ];
    try {
      await this.deps.accounts.save(account, events.map((e) => this.event(account.id, self(identity), e)), 0);
    } catch (e) {
      if (e instanceof AccountConflictError) throw accountExists();
      if (e instanceof PlayerIdTakenError) throw takenRejection();
      throw e;
    }
    return account;
  }

  /**
   * Primeiro acesso pelo Google de quem já tinha conta: liga o login à conta do mesmo e-mail.
   * Sem conta com esse e-mail, recusa como não cadastrada. Login por senha não prova o e-mail, então nunca liga.
   * Conta criada com senha (e-mail não provado): o Google prova o dono, e os logins de senha caem — quem
   * cadastrou o e-mail de outra pessoa perde o acesso.
   */
  async linkLogin(identity: Identity, email: string): Promise<Account> {
    const record = await this.deps.accounts.findByEmail(normalizeEmail(email));
    if (!record) throw notFound();
    if (record.account.logins.includes(identity.login)) return record.account;
    if (identity.provider === 'password') throw googleAccountExists();
    return this.execute(record.account.id, (account) => {
      if (account.logins.includes(identity.login)) return null;
      if (account.emailProven === false) {
        return {
          actor: self(identity),
          account: { ...account, logins: [identity.login], emailProven: true },
          data: { type: 'login_linked', login: identity.login, dropped: account.logins },
        };
      }
      return {
        actor: self(identity),
        account: { ...account, logins: [...account.logins, identity.login] },
        data: { type: 'login_linked', login: identity.login },
      };
    });
  }

  /**
   * Torna este dispositivo o ativo. No primeiro acesso ativa direto; com outro dispositivo ativo,
   * só troca com `replace` (o jogador confirmou na tela) e o anterior fica revogado.
   */
  async activateSession(identity: Identity, replace: boolean): Promise<Account> {
    const { account } = await this.resolve(identity);
    return this.execute(account.id, (current) => {
      if (current.activeSession === identity.session) return null;
      if (current.activeSession && !replace) {
        throw new CommandRejected('session_conflict', 'Outro dispositivo está ativo; confirme para desconectá-lo');
      }
      return {
        actor: self(identity),
        account: { ...current, activeSession: identity.session },
        data: { type: 'session_activated', session: identity.session, replaced: current.activeSession },
      };
    });
  }

  /** Valida a sessão do token a cada chamada da API e resolve o papel. */
  async authenticate(identity: Identity): Promise<Principal> {
    const { account } = await this.resolve(identity);
    if (account.activeSession !== identity.session) {
      throw new CommandRejected('session_inactive', 'Este dispositivo foi desconectado; entre de novo para usá-lo');
    }
    return { account, actor: actorFor(account, identity.groups) };
  }

  /** Conta sem Player ID informa depois. Para trocar um Player ID já cadastrado, só pelo ADM. */
  async claimPlayerId(identity: Identity, playerId: string): Promise<Account> {
    const value = validated(() => toPlayerId(playerId));
    const { account } = await this.resolve(identity);
    return this.execute(account.id, (current) => {
      if (current.playerId) {
        throw new CommandRejected('player_id_set', 'Seu Player ID já está cadastrado. Para trocar, procure o ADM.');
      }
      return {
        actor: self(identity),
        account: { ...current, playerId: value },
        data: { type: 'player_id_claimed', playerId: value },
      };
    });
  }

  /** O ADM procura quem cadastrou um Player ID antes de desfazer o vínculo. */
  async findByPlayerId(actor: Actor | null, playerId: string): Promise<Account> {
    requireAdmin(actor);
    return (await this.holderOf(playerId)).account;
  }

  /** Vínculo errado: o ADM tira o Player ID da conta, e o dono verdadeiro pode cadastrá-lo. */
  async unlinkPlayerId(actor: Actor | null, playerId: string): Promise<Account> {
    requireAdmin(actor);
    const value = validated(() => toPlayerId(playerId));
    const { account } = await this.holderOf(value);
    return this.execute(account.id, (current) => {
      if (current.playerId !== value) return null;
      return { actor, account: { ...current, playerId: null }, data: { type: 'player_id_unlinked', playerId: value } };
    });
  }

  private async holderOf(playerId: string): Promise<AccountRecord> {
    const record = await this.deps.accounts.findByPlayerId(validated(() => toPlayerId(playerId)));
    if (!record) throw new CommandRejected('account_not_found', 'Nenhuma conta com esse Player ID');
    return record;
  }

  private async resolve(identity: Identity): Promise<AccountRecord> {
    const record = await this.deps.accounts.findByLogin(identity.login);
    if (!record) throw notFound();
    return record;
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
      if (!record) throw notFound();
      const change = await decide(record.account);
      if (!change) return record.account;
      try {
        await this.deps.accounts.save(change.account, [this.event(accountId, change.actor, change.data)], record.version);
        return change.account;
      } catch (e) {
        if (e instanceof PlayerIdTakenError) throw takenRejection();
        if (e instanceof AccountConflictError) throw accountExists();
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

const accountExists = () => new CommandRejected('account_exists', 'Esse e-mail já tem conta. Entre com a sua senha ou pelo Google.');

/** Senha num e-mail de conta existente: os logins de senha usam o e-mail como nome, então a conta é do Google. */
const googleAccountExists = () => new CommandRejected('account_exists', 'Esse e-mail já tem conta pelo Google. Entre com o Google.');

const takenRejection = () => new CommandRejected('player_id_taken', 'Esse Player ID já está em uso, procure o ADM');
