import type { StoreConfig } from '../events.js';

const LOCATION = 'Estr. do Mendanha, 646 – loja B, Campo Grande, Rio de Janeiro';

/** GoodGame TCG: torneios Yu-Gi-Oh! OTS Championship de novembro de 2026. */
export const goodgame: StoreConfig = {
  storeId: 'goodgame',
  storeName: 'Good Game TCG',
  checkoutUrl: 'https://www.ggtcg.com.br/?view=ecom/itens&cat=214899&ing=1',
  events: [
    {
      id: 'ots-genesys-2026-11-21',
      name: 'OTS Championship Genesys',
      date: '2026-11-21',
      time: '11:00',
      priceCents: 7500,
      location: LOCATION,
      image: '/events/ots-genesys-2026-11-21.jpeg',
      salesCloseAt: '2026-11-21T11:00:00-03:00',
    },
    {
      id: 'ots-avancado-2026-11-22',
      name: 'OTS Championship Avançado',
      date: '2026-11-22',
      time: '11:00',
      priceCents: 7500,
      location: LOCATION,
      image: '/events/ots-avancado-2026-11-22.jpeg',
      salesCloseAt: '2026-11-22T11:00:00-03:00',
    },
  ],
};
