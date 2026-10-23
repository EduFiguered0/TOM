import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  ConcurrencyError,
  PlayerIdTakenError,
  toPlayerId,
  type Account,
  type AccountRepository,
  type IdentityEvent,
} from '../../src/index.js';

const at = new Date('2026-10-23T14:00:00Z');

const account = (playerId: Account['playerId'] = null): Account => ({
  id: `teste-${randomUUID()}`,
  email: 'jogador@example.com',
  profile: { name: 'Ana Souza', birthYear: 2012, phone: null, guardianConsent: true },
  playerId,
  activeSession: 'sessao-1',
  createdAt: at,
});

const registered = (a: Account): IdentityEvent => ({
  id: randomUUID(), accountId: a.id, at, actor: { role: 'system', source: `account:${a.id}` }, type: 'account_registered',
});

/** Player ID único por execução, porque implementações reais guardam dados entre execuções. */
const uniquePlayerId = () => toPlayerId(String(Date.now()) + String(Math.floor(Math.random() * 1e6)));

/** Contrato da porta: toda implementação (memória, DynamoDB) deve passar. */
export const accountRepositoryContract = (name: string, create: () => AccountRepository) => {
  describe(`AccountRepository: ${name}`, () => {
    it('conta inexistente volta null', async () => {
      expect(await create().get(`teste-${randomUUID()}`)).toBeNull();
    });

    it('grava conta nova e devolve exatamente o que foi gravado', async () => {
      const repo = create();
      const a = account({ value: uniquePlayerId(), confirmed: false });
      expect(await repo.save(a, [registered(a)], 0)).toBe(1);
      expect(await repo.get(a.id)).toEqual({ account: a, version: 1 });
    });

    it('recusa versão desatualizada (inclusive cadastro duplicado)', async () => {
      const repo = create();
      const a = account();
      await repo.save(a, [registered(a)], 0);
      await expect(repo.save(a, [], 0)).rejects.toThrow(ConcurrencyError);
      expect(await repo.save({ ...a, activeSession: 'sessao-2' }, [], 1)).toBe(2);
      expect((await repo.get(a.id))?.account.activeSession).toBe('sessao-2');
    });

    it('acha a conta pelo Player ID só depois de confirmado', async () => {
      const repo = create();
      const playerId = uniquePlayerId();
      const a = account({ value: playerId, confirmed: false });
      await repo.save(a, [registered(a)], 0);
      expect(await repo.findByConfirmedPlayerId(playerId)).toBeNull();
      await repo.save({ ...a, playerId: { value: playerId, confirmed: true } }, [], 1);
      expect((await repo.findByConfirmedPlayerId(playerId))?.id).toBe(a.id);
    });

    it('um Player ID confirmado nunca fica em duas contas', async () => {
      const repo = create();
      const playerId = uniquePlayerId();
      const first = account({ value: playerId, confirmed: true });
      await repo.save(first, [registered(first)], 0);
      const second = account({ value: playerId, confirmed: true });
      await expect(repo.save(second, [registered(second)], 0)).rejects.toThrow(PlayerIdTakenError);
      expect(await repo.get(second.id)).toBeNull();
    });

    it('trocar o Player ID confirmado libera o anterior', async () => {
      const repo = create();
      const [old, next] = [uniquePlayerId(), uniquePlayerId()];
      const a = account({ value: old, confirmed: true });
      await repo.save(a, [registered(a)], 0);
      await repo.save({ ...a, playerId: { value: next, confirmed: true } }, [], 1);
      expect(await repo.findByConfirmedPlayerId(old)).toBeNull();
      const b = account({ value: old, confirmed: true });
      expect(await repo.save(b, [registered(b)], 0)).toBe(1);
    });
  });
};
