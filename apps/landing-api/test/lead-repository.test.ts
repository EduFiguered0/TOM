import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import type { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import type { Lead } from '@tom/landing-core';
import { describe, expect, it } from 'vitest';
import { DynamoLeadRepository, LeadConflictError, LeadExistsError } from '../src/lead-repository.js';

type Command = { constructor: { name: string }; input: Record<string, unknown> };
type Item = { Put: { Item: Record<string, unknown>; ConditionExpression?: string; ExpressionAttributeValues?: Record<string, unknown> } };

const NOW = new Date('2026-11-17T12:00:00Z');
const EXPIRES = Math.floor(NOW.getTime() / 1000) + 180 * 86_400;

const lead: Lead = {
  leadId: 'l1', storeId: 'goodgame', googleSub: 'g-1', cognitoSub: 'c-1', fullName: 'Ana Souza', email: 'ana@example.com',
  phone: null, birthDate: null, status: 'INCOMPLETE', marketingOptIn: false,
  firstTouch: { source: 'instagram', medium: null, campaign: null, content: null, at: NOW.toISOString() },
  createdAt: NOW.toISOString(), updatedAt: NOW.toISOString(), version: 1,
};

const setup = (reply: (command: Command) => unknown = () => ({})) => {
  const sent: Command[] = [];
  const client = { send: (command: Command) => { sent.push(command); return Promise.resolve(reply(command)); } } as unknown as DynamoDBDocumentClient;
  const repo = new DynamoLeadRepository(client, { tableName: 'leads', now: () => NOW });
  const items = () => sent.flatMap((c) => ((c.input['TransactItems'] ?? []) as Item[]).map((t) => t.Put));
  return { repo, sent, items };
};

describe('repositório de leads (DynamoDB)', () => {
  it('cria lead e trava do Google numa transação condicional, separados por loja', async () => {
    const { repo, items } = setup();
    await repo.create(lead);
    const puts = items();
    expect(puts.map((p) => [p.Item['pk'], p.Item['sk']])).toEqual([
      ['store#goodgame#google#g-1', 'lock'],
      ['store#goodgame#lead#l1', 'lead'],
    ]);
    expect(puts.every((p) => p.ConditionExpression === 'attribute_not_exists(pk)')).toBe(true);
    expect(puts.every((p) => p.Item['expiresAt'] === EXPIRES)).toBe(true);
  });

  it('trava já existente vira LeadExistsError (sem lead duplicado)', async () => {
    const { repo } = setup(() => {
      throw new TransactionCanceledException({ message: 'x', $metadata: {}, CancellationReasons: [{ Code: 'ConditionalCheckFailed' }, { Code: 'None' }] });
    });
    await expect(repo.create(lead)).rejects.toBeInstanceOf(LeadExistsError);
  });

  it('atualiza com controle de versão e grava o histórico de consentimentos', async () => {
    const { repo, items } = setup();
    await repo.update({ ...lead, version: 3 }, [{ kind: 'terms', version: '1.0', sha256: 'abc', value: true, at: NOW.toISOString() }]);
    const [leadPut, consent] = items();
    expect(leadPut?.ConditionExpression).toBe('version = :prev');
    expect(leadPut?.ExpressionAttributeValues).toEqual({ ':prev': 2 });
    expect(consent?.Item).toMatchObject({ pk: 'store#goodgame#lead#l1', kind: 'terms', version: '1.0', sha256: 'abc', expiresAt: EXPIRES });
    expect(String(consent?.Item['sk'])).toMatch(/^consent#2026-11-17T12:00:00.000Z#terms$/);
  });

  it('versão mudada no meio vira LeadConflictError', async () => {
    // Só a transação falha; a leitura dos consentimentos antes dela funciona.
    const { repo } = setup((c) => {
      if (!c.input['TransactItems']) return { Items: [] };
      throw new TransactionCanceledException({ message: 'x', $metadata: {}, CancellationReasons: [{ Code: 'ConditionalCheckFailed' }] });
    });
    await expect(repo.update(lead, [])).rejects.toBeInstanceOf(LeadConflictError);
    await expect(repo.addIntent('goodgame', { intentId: 'i', leadId: 'l1', eventId: 'e', at: 'a', status: 'REDIRECTED',
      utm: { source: 'direct', medium: null, campaign: null, content: null } }, lead)).rejects.toBeInstanceOf(LeadConflictError);
  });

  it('intenção de compra REDIRECTED renova o prazo do lead e nunca grava compra', async () => {
    const { repo, items } = setup();
    const intent = { intentId: 'i1', leadId: 'l1', eventId: 'ots-genesys-2026-11-21', at: NOW.toISOString(), status: 'REDIRECTED' as const,
      utm: { source: 'instagram', medium: null, campaign: null, content: null } };
    await repo.addIntent('goodgame', intent, lead);
    const puts = items();
    expect(puts[0]?.Item).toMatchObject({ pk: 'store#goodgame#lead#l1', sk: `intent#${NOW.toISOString()}#i1`, status: 'REDIRECTED', eventId: 'ots-genesys-2026-11-21' });
    expect(puts[1]?.Item).toMatchObject({ sk: 'lead', expiresAt: EXPIRES });
    expect(puts.some((p) => String(p.Item['sk']).startsWith('purchase') || String(p.Item['pk']).includes('purchase'))).toBe(false);
  });

  it('acha o lead pela trava do Google', async () => {
    const { repo, sent } = setup((c) => (c.input['Key'] && (c.input['Key'] as { sk: string }).sk === 'lock'
      ? { Item: { leadId: 'l1' } }
      : { Item: { ...lead, pk: 'x', sk: 'lead', expiresAt: 1 } }));
    expect(await repo.findByGoogleSub('goodgame', 'g-1')).toEqual(lead);
    expect(sent.map((c) => c.input['Key'])).toEqual([
      { pk: 'store#goodgame#google#g-1', sk: 'lock' },
      { pk: 'store#goodgame#lead#l1', sk: 'lead' },
    ]);
  });

  it('último consentimento de um tipo', async () => {
    const { repo, sent } = setup(() => ({ Items: [
      { kind: 'marketing', version: null, sha256: null, value: true, at: 'b' },
      { kind: 'terms', version: '1.0', sha256: 'abc', value: true, at: 'a' },
    ] }));
    expect(await repo.latestConsent('goodgame', 'l1', 'terms')).toEqual({ kind: 'terms', version: '1.0', sha256: 'abc', value: true, at: 'a' });
    expect(sent[0]?.input).toMatchObject({ ScanIndexForward: false, ExpressionAttributeValues: { ':pk': 'store#goodgame#lead#l1', ':prefix': 'consent#' } });
  });

  it('leituras fortemente consistentes (o checkout logo depois do cadastro vê o que foi gravado)', async () => {
    const { repo, sent } = setup((c) => (c.input['Key'] ? { Item: { ...lead } } : { Items: [] }));
    await repo.findByGoogleSub('goodgame', 'g-1');
    await repo.latestConsent('goodgame', 'l1', 'terms');
    expect(sent.map((c) => c.input['ConsistentRead'])).toEqual([true, true, true]);
  });

  it('conflito de transação na criação também vira LeadExistsError', async () => {
    const { repo } = setup(() => {
      throw new TransactionCanceledException({ message: 'x', $metadata: {}, CancellationReasons: [{ Code: 'TransactionConflict' }, { Code: 'None' }] });
    });
    await expect(repo.create(lead)).rejects.toBeInstanceOf(LeadExistsError);
  });

  it('intenção só regrava o lead se ele não mudou, e renova o prazo dos consentimentos', async () => {
    const consent = { pk: 'store#goodgame#lead#l1', sk: 'consent#a#terms', kind: 'terms', version: '1.0', sha256: 'abc', value: true, at: 'a', expiresAt: 1 };
    const { repo, items } = setup((c) => (c.input['KeyConditionExpression'] ? { Items: [consent] } : {}));
    const intent = { intentId: 'i1', leadId: 'l1', eventId: 'e', at: NOW.toISOString(), status: 'REDIRECTED' as const,
      utm: { source: 'direct', medium: null, campaign: null, content: null } };
    await repo.addIntent('goodgame', intent, { ...lead, version: 4 });
    const puts = items();
    const leadPut = puts.find((p) => p.Item['sk'] === 'lead');
    expect(leadPut?.ConditionExpression).toBe('version = :v');
    expect(leadPut?.ExpressionAttributeValues).toEqual({ ':v': 4 });
    expect(puts.find((p) => p.Item['sk'] === 'consent#a#terms')?.Item['expiresAt']).toBe(EXPIRES);
  });

  it('cadastro também renova o prazo dos consentimentos já dados', async () => {
    const consent = { pk: 'store#goodgame#lead#l1', sk: 'consent#a#terms', kind: 'terms', version: '1.0', sha256: 'abc', value: true, at: 'a', expiresAt: 1 };
    const { repo, items } = setup((c) => (c.input['KeyConditionExpression'] ? { Items: [consent] } : {}));
    await repo.update({ ...lead, version: 2 }, []);
    expect(items().find((p) => p.Item['sk'] === 'consent#a#terms')?.Item['expiresAt']).toBe(EXPIRES);
  });
});
