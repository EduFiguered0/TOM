import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import { describe, expect, it } from 'vitest';
import { isConcurrencyFailure } from '../src/dynamo-event-store.js';

const canceled = (...codes: string[]) =>
  new TransactionCanceledException({ message: 'cancelada', $metadata: {}, CancellationReasons: codes.map((Code) => ({ Code })) });

describe('gravação de rodada recusada pelo DynamoDB', () => {
  it('versão mudou ou outra transação passou na frente: é concorrência (repete); o resto não', () => {
    expect(isConcurrencyFailure(canceled('ConditionalCheckFailed', 'None'))).toBe(true);
    // Dois reportes ao mesmo tempo: o DynamoDB às vezes cancela por conflito, sem chegar a checar a versão.
    expect(isConcurrencyFailure(canceled('TransactionConflict', 'None'))).toBe(true);
    expect(isConcurrencyFailure(canceled('ValidationError'))).toBe(false);
    expect(isConcurrencyFailure(new Error('rede'))).toBe(false);
  });
});
