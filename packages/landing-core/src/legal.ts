/**
 * Termos e Política vigentes. Cada versão é um arquivo imutável em apps/landing/public/legal; mudar o texto
 * exige arquivo novo, versão nova e hash novo (o teste confere o hash). Aceite de versão antiga pede novo aceite.
 */
export interface LegalDoc {
  kind: 'terms' | 'privacy';
  version: string;
  /** Caminho publicado no site. */
  path: string;
  /** SHA-256 do arquivo publicado, gravado junto com cada aceite. */
  sha256: string;
}

export const LEGAL: { terms: LegalDoc; privacy: LegalDoc } = {
  terms: {
    kind: 'terms',
    version: '1.0',
    path: '/legal/termos-v1.0.md',
    sha256: 'dfef9d49c137dc495bb635126d475885f706ed98b9557e15d7fb954583f6d2ec',
  },
  privacy: {
    kind: 'privacy',
    version: '1.0',
    path: '/legal/privacidade-v1.0.md',
    sha256: '279dd772111e2e3074569d08508e6c3477748f7d0afc577e76b95876c987bfe6',
  },
};
