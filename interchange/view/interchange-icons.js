export const InterchangeIcons = Object.freeze({
  import: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v11m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  export: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21V10m0 0 4 4m-4-4-4 4M4 7V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  config: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z" fill="none" stroke="currentColor" stroke-width="1.8"/><path d="m19.4 15 .7 1.2-1.6 2.8-1.4-.2a7.8 7.8 0 0 1-1.7 1l-.2 1.4H9.8l-.2-1.4a7.8 7.8 0 0 1-1.7-1l-1.4.2L4.9 16.2l.7-1.2a7.4 7.4 0 0 1 0-2l-.7-1.2L6.5 9l1.4.2a7.8 7.8 0 0 1 1.7-1l.2-1.4h4.4l.2 1.4a7.8 7.8 0 0 1 1.7 1l1.4-.2 1.6 2.8-.7 1.2a7.4 7.4 0 0 1 0 2Z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
  source: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  canonical: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 6h14v12H5zM9 10h6M9 14h6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  rendered: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m12 3 7 4v10l-7 4-7-4V7l7-4Zm0 0v18m7-14-7 4-7-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  validate: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 13 4 4L19 7" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
});

export function renderIcon(name) {
  return InterchangeIcons[name] || '';
}
