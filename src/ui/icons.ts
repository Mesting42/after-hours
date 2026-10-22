/** Small original line icons share a single visual/ARIA contract. */
const paths: Record<string, string> = {
  lift: '<rect x="5" y="2" width="14" height="20" rx="1"/><path d="M12 3v18M8 9l2-3 2 3m4 6-2 3-2-3"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  sound: '<path d="M11 4 5 9H2v6h3l6 5zM15 8a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14"/>',
  settings: '<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
  shield: '<path d="m12 2 8 3v6c0 5-8 11-8 11S4 16 4 11V5zM8 12l3 3 5-6"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  crouch: '<circle cx="13" cy="4" r="2"/><path d="m12 8-5 5 6 3-3 5m2-13 4 4 4 1M7 13l-4 6"/>',
  run: '<circle cx="15" cy="4" r="2"/><path d="m14 8-4 5 5 4-2 5m-3-9-4 6-4 1m12-12 4 4h4M10 8l-4 2"/>',
  hand: '<path d="M8 12V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v10c0 5-3 7-7 7-4 0-6-3-7-5l-3-4a2 2 0 0 1 3-2l2 2"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  home: '<path d="m3 11 9-8 9 8M5 9v12h14V9M10 21v-7h4v7"/>',
  card: '<rect x="3" y="5" width="18" height="15" rx="2"/><path d="M8 2v6M13 10h5m-5 4h5"/><circle cx="8" cy="13" r="2"/>',
};
export const icon = (name: string, className = ''): string => `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.arrow}</svg>`;
export const escapeHTML = (value: string): string => value.replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[s]!);
