import type { LegalDoc } from '@tom/landing-core';
import { useEffect, useState } from 'preact/hooks';
import { renderLegal, type Block } from '../markdown.js';

/** Termos ou Política na versão vigente; o arquivo de cada versão nunca muda (o link para o .md fica disponível). */
export const LegalPage = ({ doc }: { doc: LegalDoc }) => {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    fetch(doc.path)
      .then(async (r) => { if (!r.ok) throw new Error(String(r.status)); setBlocks(renderLegal(await r.text())); })
      .catch(() => { setFailed(true); });
  }, [doc.path]);

  return (
    <article class="mx-auto grid max-w-2xl gap-3 rounded-2xl border border-line bg-panel p-5">
      {failed && <p role="alert" class="text-error">Não foi possível carregar o texto. Tente de novo.</p>}
      {!blocks && !failed && <p class="text-muted">Carregando…</p>}
      {blocks?.map((b, i) => {
        if (b.kind === 'h1') return <h1 key={i} class="m-0 text-2xl font-bold text-gold">{b.text}</h1>;
        if (b.kind === 'h2') return <h2 key={i} class="m-0 mt-2 text-lg font-bold">{b.text}</h2>;
        if (b.kind === 'li') return <p key={i} class="m-0 pl-4 text-sm before:mr-2 before:content-['•']">{b.text}</p>;
        return <p key={i} class="m-0 text-sm text-muted">{b.text}</p>;
      })}
      <p class="m-0 text-xs text-muted">
        Versão {doc.version} · <a class="text-gold underline" href={doc.path}>arquivo original</a> · <a class="text-gold underline" href="/">voltar</a>
      </p>
    </article>
  );
};
