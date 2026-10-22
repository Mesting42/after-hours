import { icon } from '../icons';

/** Shared action anatomy keeps all dialog states visually and semantically consistent. */
export const button = (id: string, label: string, type = 'secondary', symbol = 'arrow'): string =>
  `<button id="${id}" class="button ${type}"><span>${label}</span>${icon(symbol)}</button>`;
