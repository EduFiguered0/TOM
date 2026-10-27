import { describe, expect, it } from 'vitest';
import {
  AccountService,
  CommandRejected,
  InMemoryAccountRepository,
  InMemoryPhotoStore,
  PhotoService,
  visiblePhoto,
  type Account,
  type Identity,
  type Profile,
  type RejectCode,
} from '../../src/index.js';
import { TestClock } from '../tournament/support.js';
import { photoStoreContract } from './photo-store-contract.js';

photoStoreContract('em memória', () => new InMemoryPhotoStore());

const PNG = `data:image/png;base64,${'A'.repeat(100)}`;
const adult: Profile = { firstName: 'Ana', lastName: 'Souza', birthYear: 1990, phone: null, guardianConsent: false };
const kid: Profile = { ...adult, birthYear: 2015, guardianConsent: true };
const admin = { role: 'admin', accountId: 'adm' } as const;

const setup = () => {
  const accounts = new InMemoryAccountRepository();
  const clock = new TestClock(new Date('2026-10-27T14:00:00Z'));
  let n = 0;
  const ids = { next: () => `i${String(++n)}` };
  const accountService = new AccountService({ accounts, clock, ids });
  const photos = new InMemoryPhotoStore();
  const service = new PhotoService({ photos, accounts: accountService, ids });
  const person = async (login: string, profile: Profile) => {
    const identity: Identity = { login, session: `s-${login}`, groups: [], provider: 'password' };
    const account = await accountService.register(identity, `${login}@example.com`, { profile, playerId: null });
    return { identity, account };
  };
  return { service, accountService, photos, clock, person };
};

const rejects = async (promise: Promise<unknown>, code: RejectCode, message?: string) => {
  const error = await promise.catch((e: unknown) => e);
  expect(error).toBeInstanceOf(CommandRejected);
  expect((error as CommandRejected).code).toBe(code);
  if (message) expect((error as CommandRejected).message).toBe(message);
};

describe('foto do jogador', () => {
  it('envia, lê pela chave, troca (chave nova) e remove', async () => {
    const { service, person } = setup();
    const { identity } = await person('ana', adult);
    const first = await service.upload(identity, PNG);
    expect(first.photoId).toBeTruthy();
    expect(await service.read(first.photoId ?? '')).toBe(PNG);
    const second = await service.upload(identity, PNG.replace('png', 'webp'));
    expect(second.photoId).not.toBe(first.photoId);
    expect((await service.remove(identity)).photoId).toBeNull();
  });

  it('recusa formato errado ou foto grande demais', async () => {
    const { service, person } = setup();
    const { identity } = await person('ana', adult);
    await rejects(service.upload(identity, 'data:text/html;base64,AAAA'), 'invalid_input', 'Foto inválida ou grande demais');
    await rejects(service.upload(identity, `data:image/png;base64,${'A'.repeat(40_001)}`), 'invalid_input', 'Foto inválida ou grande demais');
  });

  it('menor só tem a foto visível com a autorização de imagem do responsável', async () => {
    const { service, accountService, clock, person } = setup();
    const { identity } = await person('kid', kid);
    const withPhoto = await service.upload(identity, PNG);
    expect(visiblePhoto(withPhoto, clock.now())).toBeNull();
    const allowed = await accountService.setImageConsent(identity, true);
    expect(visiblePhoto(allowed, clock.now())).toBe(withPhoto.photoId);
    expect(visiblePhoto(await accountService.setImageConsent(identity, false), clock.now())).toBeNull();
  });

  it('adulto tem a foto visível; sem foto, nada; conta antiga sem os campos, nada', async () => {
    const { service, clock, person } = setup();
    const { identity, account } = await person('ana', adult);
    expect(visiblePhoto(account, clock.now())).toBeNull();
    const withPhoto = await service.upload(identity, PNG);
    expect(visiblePhoto(withPhoto, clock.now())).toBe(withPhoto.photoId);
    const legacy: Account = { ...account };
    delete legacy.photoId;
    expect(visiblePhoto(legacy, clock.now())).toBeNull();
  });

  it('o ADM remove a foto de um jogador; jogador não remove a de outro', async () => {
    const { service, person } = setup();
    const { identity, account } = await person('ana', adult);
    await service.upload(identity, PNG);
    await rejects(service.removeByAdmin({ role: 'player', accountId: 'x', playerId: '1' } as never, account.id), 'forbidden');
    expect((await service.removeByAdmin(admin, account.id)).photoId).toBeNull();
  });
});
