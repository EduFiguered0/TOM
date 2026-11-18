import { Calendar, Clock, MapPin, Ticket } from 'lucide-preact';
import type { PublicEvent } from '../api.js';

const price = (cents: number) => (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const day = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d ?? ''}/${m ?? ''}`;
};

interface Props {
  events: PublicEvent[];
  busy: string | null;
  onBuy: (eventId: string) => void;
}

/** Cards dos torneios com a arte, dados e botão de compra. */
export const EventList = ({ events, busy, onBuy }: Props) => (
  <section aria-labelledby="torneios" class="grid gap-6 sm:grid-cols-2">
    <h2 id="torneios" class="sr-only">Torneios</h2>
    {events.map((event) => (
      <article key={event.id} class="overflow-hidden rounded-2xl border border-line bg-panel shadow-lg">
        <img src={event.image} alt={`Arte do ${event.name}`} width={1221} height={1290} class="block h-auto w-full" loading="lazy" decoding="async" />
        <div class="grid gap-3 p-5">
          <h3 class="m-0 text-xl font-bold text-gold">{event.name}</h3>
          <ul class="m-0 grid list-none gap-1 p-0 text-sm text-muted">
            <li class="flex items-center gap-2"><Calendar size={16} aria-hidden="true" /> {day(event.date)}</li>
            <li class="flex items-center gap-2"><Clock size={16} aria-hidden="true" /> {event.time}</li>
            <li class="flex items-center gap-2"><Ticket size={16} aria-hidden="true" /> {price(event.priceCents)}</li>
            <li class="flex items-start gap-2"><MapPin size={16} aria-hidden="true" class="mt-0.5 shrink-0" /> {event.location}</li>
          </ul>
          <button
            type="button"
            disabled={event.closed || busy !== null}
            onClick={() => { onBuy(event.id); }}
            class="mt-1 min-h-12 rounded-xl bg-brand px-4 font-bold text-white transition hover:bg-brand-dark focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold disabled:cursor-not-allowed disabled:opacity-60"
          >
            {event.closed ? 'Inscrições encerradas' : busy === event.id ? 'Aguarde…' : 'Comprar ingresso'}
          </button>
        </div>
      </article>
    ))}
  </section>
);
