import type { Account } from './account.js';
import type { Identity } from './account-service.js';
import type { Actor } from '../shared/actor.js';
import { CommandRejected } from '../shared/command-rejected.js';
import type { IdGenerator } from '../shared/ports.js';

/** Imagens das fotos, por chave aleatória (a chave muda a cada troca). */
export interface PhotoStore {
  put(id: string, dataUrl: string): Promise<void>;
  get(id: string): Promise<string | null>;
}

/** Implementação de referência da porta; usada em testes e desenvolvimento local. */
export class InMemoryPhotoStore implements PhotoStore {
  private readonly items = new Map<string, string>();

  put(id: string, dataUrl: string): Promise<void> {
    this.items.set(id, dataUrl);
    return Promise.resolve();
  }

  get(id: string): Promise<string | null> {
    return Promise.resolve(this.items.get(id) ?? null);
  }
}

const ADULT_AGE = 18;
const MAX_LENGTH = 40_000;
const DATA_URL = /^data:image\/(webp|jpeg|png);base64,[A-Za-z0-9+/]+=*$/;

/**
 * Chave da foto quando ela pode aparecer (TV, mesa, guia Jogadores): adulto, ou menor com a autorização de imagem
 * do responsável. Sem foto ou sem autorização: null (avatar genérico). Quem decide é o servidor.
 */
export const visiblePhoto = (account: Account, now: Date): string | null => {
  if (!account.photoId) return null;
  const adult = now.getUTCFullYear() - account.profile.birthYear >= ADULT_AGE;
  return adult || account.imageConsent === true ? account.photoId : null;
};

export interface PhotoServiceDeps {
  photos: PhotoStore;
  accounts: {
    setPhoto(identity: Identity, photoId: string | null): Promise<Account>;
    clearPhoto(actor: Actor | null, accountId: string): Promise<Account>;
  };
  ids: IdGenerator;
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
    await this.deps.photos.put(id, dataUrl);
    return this.deps.accounts.setPhoto(identity, id);
  }

  remove(identity: Identity): Promise<Account> {
    return this.deps.accounts.setPhoto(identity, null);
  }

  removeByAdmin(actor: Actor | null, accountId: string): Promise<Account> {
    return this.deps.accounts.clearPhoto(actor, accountId);
  }

  /** Quem tem a chave vê a foto: ela só sai do servidor para quem pode ver. */
  read(photoId: string): Promise<string | null> {
    return this.deps.photos.get(photoId);
  }
}
