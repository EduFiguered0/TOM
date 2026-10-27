import { encode } from 'uqr';
import { qrPath } from './board.js';

/** QR desenhado como um caminho SVG; a altura vem de `class` (grande na espera, pequeno no rodapé da rodada). */
export const Qr = ({ url, class: size }: { url: string; class: string }) => {
  const { data, size: modules } = encode(url, { border: 2 });
  return (
    <svg class={`aspect-square w-auto rounded-[1vw] ${size}`} viewBox={`0 0 ${String(modules)} ${String(modules)}`} role="img"
      aria-label={`QR Code para ${url}`} shape-rendering="crispEdges">
      <rect width={modules} height={modules} fill="#fff" />
      <path d={qrPath(data)} fill="#000" />
    </svg>
  );
};
