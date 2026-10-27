import type { Account } from './account.js';
import type { Identity } from './account-service.js';
import type { Actor } from '../shared/actor.js';
import { CommandRejected } from '../shared/command-rejected.js';
import type { Clock, IdGenerator } from '../shared/ports.js';

/** Imagens das fotos, por chave aleatória (a chave muda a cada troca), com a conta dona. */
export interface PhotoStore {
  put(id: string, dataUrl: string, owner: string): Promise<void>;
  get(id: string): Promise<{ dataUrl: string; owner: string } | null>;
}

/** Implementação de referência da porta; usada em testes e desenvolvimento local. */
export class InMemoryPhotoStore implements PhotoStore {
  private readonly items = new Map<string, { dataUrl: string; owner: string }>();

  put(id: string, dataUrl: string, owner: string): Promise<void> {
    this.items.set(id, { dataUrl, owner });
    return Promise.resolve();
  }

  get(id: string): Promise<{ dataUrl: string; owner: string } | null> {
    const found = this.items.get(id);
    return Promise.resolve(found ? { ...found } : null);
  }
}

/** Só o ano de nascimento é conhecido: adulto só a partir do ano seguinte ao dos 18 (nunca mostra a foto de um menor). */
const ADULT_AGE = 18;
const MAX_LENGTH = 40_000;
const DATA_URL = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/;

/**
 * Chave da foto quando ela pode aparecer (TV, mesa, guia Jogadores): adulto, ou menor com a autorização de imagem
 * do responsável. Sem foto ou sem autorização: null (avatar genérico). Quem decide é o servidor.
 */
export const visiblePhoto = (account: Account, now: Date): string | null => {
  if (!account.photoId) return null;
  const adult = now.getUTCFullYear() - account.profile.birthYear > ADULT_AGE;
  return adult || account.imageConsent === true ? account.photoId : null;
};

export interface PhotoServiceDeps {
  photos: PhotoStore;
  accounts: {
    setPhoto(identity: Identity, photoId: string | null): Promise<Account>;
    clearPhoto(actor: Actor | null, accountId: string): Promise<Account>;
    byId(accountId: string): Promise<Account | null>;
    resolveId(identity: Identity): Promise<string>;
  };
  ids: IdGenerator;
  clock: Clock;
}

/** O jogador põe, troca ou tira a própria foto; o ADM tira uma foto inadequada. */
export class PhotoService {
  constructor(private readonly deps: PhotoServiceDeps) {}

  /** A imagem chega já recortada e reduzida pelo celular (128×128). */
  async upload(identity: Identity, dataUrl: string): Promise<Account> {
    if (dataUrl.length > MAX_LENGTH || !DATA_URL.test(dataUrl)) {
      throw new CommandRejected('invalid_input', 'Foto inválida ou grande demais');
    }
    const id = this.deps.ids.next();
    await this.deps.photos.put(id, dataUrl, await this.deps.accounts.resolveId(identity));
    return this.deps.accounts.setPhoto(identity, id);
  }

  remove(identity: Identity): Promise<Account> {
    return this.deps.accounts.setPhoto(identity, null);
  }

  removeByAdmin(actor: Actor | null, accountId: string): Promise<Account> {
    return this.deps.accounts.clearPhoto(actor, accountId);
  }

  /**
   * A imagem só abre se a chave ainda é a foto atual do dono e a foto ainda pode aparecer (o dono sempre vê a sua):
   * trocar, remover ou retirar a autorização corta o acesso na hora, mesmo de quem já tinha a chave.
   */
  async read(photoId: string, viewerAccountId: string): Promise<string | null> {
    const stored = await this.deps.photos.get(photoId);
    if (!stored) return null;
    const owner = await this.deps.accounts.byId(stored.owner);
    if (owner?.photoId !== photoId) return null;
    if (viewerAccountId === owner.id) return stored.dataUrl;
    return visiblePhoto(owner, this.deps.clock.now()) === photoId ? stored.dataUrl : null;
  }
}
