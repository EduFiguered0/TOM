import { useEffect, useState } from 'preact/hooks';
import { initials, type PhotoCache } from './photo-cache.js';

/**
 * Bolinha antes do nome: a foto quando o servidor mandou a chave (adulto, ou menor com autorização), senão as
 * iniciais (avatar genérico). `class` define o tamanho.
 */
export const Avatar = ({ photo, name, cache, class: size }: { photo: string | null; name: string; cache: PhotoCache | null; class: string }) => {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    setSrc(null);
    if (!photo || !cache) return undefined;
    let stopped = false;
    void cache.get(photo).then((data) => { if (!stopped) setSrc(data); }).catch(() => undefined);
    return () => { stopped = true; };
  }, [photo, cache]);

  return src
    ? <img src={src} alt="" class={`shrink-0 rounded-full object-cover ${size}`} />
    : (
      <span class={`flex shrink-0 items-center justify-center rounded-full bg-line font-bold text-muted ${size}`} aria-hidden="true">
        <span class="text-[.45em] leading-none">{initials(name)}</span>
      </span>
    );
};
