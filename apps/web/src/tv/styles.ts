import type { TableColor } from '@tom/contracts';

/** TV: tela cheia, sempre escura, tipografia em vw para ler a vários metros, sem rolar. */
export const screen = 'fixed inset-0 flex flex-col gap-[1.2vh] overflow-hidden bg-bg px-[2.5vw] py-[2.5vh] text-text';
export const centered = `${screen} items-center justify-center text-center gap-[2.5vh]`;
export const eventTitle = 'text-[2.2vw] font-bold';
export const tile = 'flex min-w-0 items-center gap-[1.2vw] rounded-[.8vw] border border-line bg-panel px-[1.2vw]';

export const DOT: Record<TableColor, string> = { gray: 'bg-gray', orange: 'bg-orange', green: 'bg-green', red: 'bg-red' };
export const EDGE: Record<TableColor, string> = { gray: 'border-l-gray', orange: 'border-l-orange', green: 'border-l-green', red: 'border-l-red' };
