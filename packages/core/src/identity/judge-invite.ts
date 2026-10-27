import type { Principal } from './account-service.js';
import type { Account } from './account.js';
import type { Actor } from '../shared/actor.js';
import { CommandRejected } from '../shared/command-rejected.js';
import type { Clock } from '../shared/ports.js';

/** Convite de juiz: QR mostrado só no painel do ADM; vale 15 minutos e uma única vez. */
export interface JudgeInvite {
  code: string;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  /** Conta que usou o convite; null enquanto ninguém usou. */
  usedBy: string | null;
  cancelled: boolean;
}

/**
 * Porta de persistência dos convites. `markUsed` só grava se o convite ainda vale (não usado, não cancelado, no prazo);
 * `cancel` não mexe em convite já usado (quem usou continua registrado).
 */
export interface JudgeInviteRepository {
  create(invite: JudgeInvite): Promise<void>;
  get(code: string): Promise<JudgeInvite | null>;
  listAll(): Promise<JudgeInvite[]>;
  markUsed(code: string, accountId: string, now: Date): Promise<boolean>;
  cancel(code: string): Promise<void>;
}

/** Implementação de referência da porta; usada em testes e desenvolvimento local. */
export class InMemoryJudgeInviteRepository implements JudgeInviteRepository {
  private readonly items = new Map<string, JudgeInvite>();

  create(invite: JudgeInvite): Promise<void> {
    this.items.set(invite.code, structuredClone(invite));
    return Promise.resolve();
  }

  get(code: string): Promise<JudgeInvite | null> {
    const found = this.items.get(code);
    return Promise.resolve(found ? structuredClone(found) : null);
  }

  listAll(): Promise<JudgeInvite[]> {
    return Promise.resolve([...this.items.values()].map((i) => structuredClone(i)));
  }

  markUsed(code: string, accountId: string, now: Date): Promise<boolean> {
    const found = this.items.get(code);
    if (!found || found.usedBy !== null || found.cancelled || found.expiresAt <= now) return Promise.resolve(false);
    this.items.set(code, { ...found, usedBy: accountId });
    return Promise.resolve(true);
  }

  cancel(code: string): Promise<void> {
    const found = this.items.get(code);
    if (found?.usedBy === null) this.items.set(code, { ...found, cancelled: true });
    return Promise.resolve();
  }
}

const VALID_MS = 15 * 60_000;
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/** 10 caracteres sem os que se confundem (0/O, 1/I/L). */
const newInviteCode = (): string =>
  Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');

const invalid = () => new CommandRejected('invite_invalid', 'Convite já utilizado ou vencido');

function requireAdmin(actor: Actor | null): asserts actor is Actor & { role: 'admin' } {
  if (actor?.role !== 'admin') throw new CommandRejected('forbidden', 'Só o ADM pode executar esta ação');
}

export interface JudgeInviteServiceDeps {
  invites: JudgeInviteRepository;
  /** Marca a conta como juiz da equipe (só pelo convite, com o código como origem). */
  accounts: { grantJudge(accountId: string, source: string): Promise<Account> };
  clock: Clock;
}

/** O ADM gera, lista e cancela convites; quem escaneia aceita e vira juiz da equipe. */
export class JudgeInviteService {
  constructor(private readonly deps: JudgeInviteServiceDeps) {}

  async create(actor: Actor | null): Promise<JudgeInvite> {
    requireAdmin(actor);
    const now = this.deps.clock.now();
    const invite: JudgeInvite = {
      code: newInviteCode(), createdBy: actor.accountId, createdAt: now, expiresAt: new Date(now.getTime() + VALID_MS), usedBy: null, cancelled: false,
    };
    await this.deps.invites.create(invite);
    return invite;
  }

  /** Convites que ainda valem, do que vence primeiro ao último. */
  async open(actor: Actor | null): Promise<JudgeInvite[]> {
    requireAdmin(actor);
    const now = this.deps.clock.now();
    return (await this.deps.invites.listAll())
      .filter((i) => i.usedBy === null && !i.cancelled && i.expiresAt > now)
      .sort((a, b) => a.expiresAt.getTime() - b.expiresAt.getTime());
  }

  async cancel(actor: Actor | null, code: string): Promise<void> {
    requireAdmin(actor);
    await this.deps.invites.cancel(code);
  }

  /** Quem escaneia vira juiz. Sem Player ID, recusa antes de gastar o convite. */
  async accept(principal: Principal, code: string): Promise<Account> {
    const invite = await this.deps.invites.get(code);
    const now = this.deps.clock.now();
    if (!invite || invite.usedBy !== null || invite.cancelled || invite.expiresAt <= now) throw invalid();
    if (!principal.account.playerId) throw new CommandRejected('invalid_input', 'O juiz precisa ter Player ID cadastrado');
    if (!(await this.deps.invites.markUsed(code, principal.account.id, now))) throw invalid();
    return this.deps.accounts.grantJudge(principal.account.id, `invite:${code}`);
  }
}
