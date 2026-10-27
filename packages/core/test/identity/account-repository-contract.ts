import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  AccountConflictError,
  ConcurrencyError,
  PlayerIdTakenError,
  toPlayerId,
  type Account,
  type AccountRepository,
  type IdentityEvent,
} from '../../src/index.js';

const at = new Date('2026-10-23T14:00:00Z');

/** Ids, logins, e-mails e Player IDs únicos por execução, porque implementações reais guardam dados entre execuções. */
const account = (playerId: Account['playerId'] = null): Account => ({
  id: randomUUID(),
  email: `teste-${randomUUID()}@example.com`,
  logins: [randomUUID()],
  profile: { firstName: 'Ana', lastName: 'Souza', birthYear: 2012, phone: null, guardianConsent: true },
  nameReviewed: true,
  playerId,
  activeSession: 'sessao-1',
  createdAt: at,
});

const registered = (a: Account): IdentityEvent => ({
  id: randomUUID(), accountId: a.id, at, actor: { role: 'system', source: 'teste' }, type: 'account_registered', login: a.logins[0] ?? '',
});

const uniquePlayerId = () => toPlayerId(String(Date.now()) + String(Math.floor(Math.random() * 1e6)));

/** Contrato da porta: toda implementação (memória, DynamoDB) deve passar. */
export const accountRepositoryContract = (name: string, create: () => AccountRepository) => {
  describe(`AccountRepository: ${name}`, () => {
    it('conta inexistente volta null por id, login e e-mail', async () => {
      const repo = create();
      expect(await repo.get(randomUUID())).toBeNull();
      expect(await repo.findByLogin(randomUUID())).toBeNull();
      expect(await repo.findByEmail(`teste-${randomUUID()}@example.com`)).toBeNull();
    });

    it('grava conta nova e acha por id, login e e-mail', async () => {
      const repo = create();
      const a = account(uniquePlayerId());
      expect(await repo.save(a, [registered(a)], 0)).toBe(1);
      const expected = { account: a, version: 1 };
      expect(await repo.get(a.id)).toEqual(expected);
      expect(await repo.findByLogin(a.logins[0] ?? '')).toEqual(expected);
      expect(await repo.findByEmail(a.email)).toEqual(expected);
    });

    it('recusa versão desatualizada (inclusive cadastro duplicado)', async () => {
      const repo = create();
      const a = account();
      await repo.save(a, [registered(a)], 0);
      await expect(repo.save(a, [], 0)).rejects.toThrow(ConcurrencyError);
      expect(await repo.save({ ...a, activeSession: 'sessao-2' }, [], 1)).toBe(2);
      expect((await repo.get(a.id))?.account.activeSession).toBe('sessao-2');
    });

    it('login novo ligado à conta passa a encontrá-la', async () => {
      const repo = create();
      const a = account();
      await repo.save(a, [registered(a)], 0);
      const google = randomUUID();
      await repo.save({ ...a, logins: [...a.logins, google] }, [], 1);
      expect((await repo.findByLogin(google))?.account.id).toBe(a.id);
    });

    it('e-mail e login nunca ficam em duas contas', async () => {
      const repo = create();
      const first = account();
      await repo.save(first, [registered(first)], 0);
      const sameEmail = { ...account(), email: first.email };
      await expect(repo.save(sameEmail, [registered(sameEmail)], 0)).rejects.toThrow(AccountConflictError);
      const sameLogin = { ...account(), logins: first.logins };
      await expect(repo.save(sameLogin, [registered(sameLogin)], 0)).rejects.toThrow(AccountConflictError);
      expect(await repo.get(sameEmail.id)).toBeNull();
      expect(await repo.get(sameLogin.id)).toBeNull();
    });

    it('all devolve as contas gravadas', async () => {
      const repo = create();
      const [a, b] = [account(), account()];
      await repo.save(a, [registered(a)], 0);
      await repo.save(b, [registered(b)], 0);
      const ids = (await repo.all()).map((x) => x.id);
      expect(ids).toEqual(expect.arrayContaining([a.id, b.id]));
      expect((await repo.all()).find((x) => x.id === a.id)).toEqual(a);
    });

    it('acha a conta pelo Player ID assim que gravada', async () => {
      const repo = create();
      const playerId = uniquePlayerId();
      const a = account(playerId);
      await repo.save(a, [registered(a)], 0);
      expect((await repo.findByPlayerId(playerId))?.account.id).toBe(a.id);
      expect(await repo.findByPlayerId(uniquePlayerId())).toBeNull();
    });

    it('um Player ID nunca fica em duas contas', async () => {
      const repo = create();
      const playerId = uniquePlayerId();
      const first = account(playerId);
      await repo.save(first, [registered(first)], 0);
      const second = account(playerId);
      await expect(repo.save(second, [registered(second)], 0)).rejects.toThrow(PlayerIdTakenError);
      expect(await repo.get(second.id)).toBeNull();
    });

    it('tirar ou trocar o Player ID libera o anterior', async () => {
      const repo = create();
      const [old, next] = [uniquePlayerId(), uniquePlayerId()];
      const a = account(old);
      await repo.save(a, [registered(a)], 0);
      await repo.save({ ...a, playerId: next }, [], 1);
      expect(await repo.findByPlayerId(old)).toBeNull();
      await repo.save({ ...a, playerId: null }, [], 2);
      expect(await repo.findByPlayerId(next)).toBeNull();
      const b = account(old);
      expect(await repo.save(b, [registered(b)], 0)).toBe(1);
      const c = account(next);
      expect(await repo.save(c, [registered(c)], 0)).toBe(1);
    });
  });
};
