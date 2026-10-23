import type { TableStatus } from './thermometer.js';

/** Verde trava a mesa para os jogadores; key lançada trava em definitivo. */
export const canPlayerReport = (status: TableStatus, keyLaunched: boolean): boolean =>
  !keyLaunched && status.color !== 'green';

/** Override depois da key lançada é permitido, mas o TOM também precisa ser corrigido. */
export const overrideRequiresTomFix = (keyLaunched: boolean): boolean => keyLaunched;
