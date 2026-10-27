/** Máscaras da guia Jogadores: o ADM reconhece a pessoa sem receber o dado inteiro (LGPD). */

const DOTS = '•••';

/** Os 3 primeiros caracteres e o domínio inteiro: `duk•••@gmail.com`. */
export const maskEmail = (email: string): string => {
  const at = email.indexOf('@');
  return at < 0 ? `${email.slice(0, 3)}${DOTS}` : `${email.slice(0, Math.min(3, at))}${DOTS}${email.slice(at)}`;
};

/** Só os 4 últimos números: `•••• 1234`. */
export const maskPhone = (phone: string | null): string | null => (phone ? `•••• ${phone.slice(-4)}` : null);
