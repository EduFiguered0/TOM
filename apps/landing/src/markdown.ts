export interface Block {
  kind: 'h1' | 'h2' | 'p' | 'li';
  text: string;
}

/** Markdown mínimo dos termos (títulos, parágrafos, listas) em blocos de texto: nada vira HTML. */
export const renderLegal = (md: string): Block[] => {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ kind: 'p', text: paragraph.join(' ') });
    paragraph = [];
  };
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    const heading = /^(#{1,2})\s+(.*)$/.exec(line);
    const item = /^-\s+(.*)$/.exec(line);
    if (heading?.[1] && heading[2] !== undefined) { flush(); blocks.push({ kind: heading[1].length === 1 ? 'h1' : 'h2', text: heading[2] }); }
    else if (item?.[1] !== undefined) { flush(); blocks.push({ kind: 'li', text: item[1] }); }
    else paragraph.push(line);
  }
  flush();
  return blocks;
};
