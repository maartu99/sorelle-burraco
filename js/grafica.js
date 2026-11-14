// Omino (figura originale in stile futurista) e icone lineari.

export const OMINO = `<svg class="omino" viewBox="0 0 320 240" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Omino geometrico che gioca a carte">
<polygon fill="#041158" opacity="0.6" points="40,225 280,225 240,235 60,235"/>
<polygon fill="#b72206" points="160,18 196,80 124,80"/>
<polygon fill="#ab1900" points="160,18 178,80 124,80"/>
<circle cx="160" cy="18" fill="#f5c800" r="6"/>
<polygon fill="#38a169" points="124,80 196,80 186,132 134,132"/>
<circle cx="148" cy="104" fill="#fcf9f8" r="14"/>
<circle cx="148" cy="104" fill="#4f599e" r="7"/>
<circle cx="146" cy="102" fill="#fcf9f8" r="2.5"/>
<polygon fill="#b72206" points="168,110 188,118 168,124"/>
<polygon fill="#f5c800" points="112,132 208,132 194,150 126,150"/>
<polygon fill="#374185" points="116,150 160,150 160,215 106,205"/>
<polygon fill="#b72206" points="160,150 204,150 214,205 160,215"/>
<polyline points="118,155 70,180 84,212" stroke="#f5c800" stroke-linecap="square" stroke-linejoin="miter" stroke-width="12"/>
<polygon fill="#ffbdb0" points="56,190 92,190 74,222"/>
<line stroke="#fcf9f8" stroke-width="4" x1="74" x2="74" y1="222" y2="232"/>
<line stroke="#fcf9f8" stroke-width="4" x1="62" x2="86" y1="232" y2="232"/>
<polyline points="202,155 244,175 220,205" stroke="#f5c800" stroke-linecap="square" stroke-linejoin="miter" stroke-width="12"/>
<g transform="translate(205, 150) rotate(-15)"><rect fill="#fcf9f8" height="42" stroke="#1c1b1b" stroke-width="2" width="28"/><polygon fill="#b72206" points="14,10 20,21 14,32 8,21"/></g>
<g transform="translate(222, 142) rotate(12)"><rect fill="#ffe081" height="42" stroke="#1c1b1b" stroke-width="2" width="28"/><polygon fill="#1c1b1b" points="14,10 20,21 14,32 8,21"/></g>
<g transform="translate(238, 146) rotate(32)"><rect fill="#fcf9f8" height="42" stroke="#1c1b1b" stroke-width="2" width="28"/><polygon fill="#b72206" points="14,12 21,21 14,30 7,21"/></g>
<polygon fill="#f5c800" opacity="0.85" points="26,45 80,10 95,25 41,60"/>
<circle cx="282" cy="72" fill="#ffbdb0" r="18"/>
<path d="M 270 72 A 12 12 0 0 1 294 72" fill="none" stroke="#1c1b1b" stroke-width="4"/>
</svg>`;

// Testa dell'omino, per il marchio piccolo in testata.
export const MARCHIO = `<svg class="marchio" viewBox="110 10 100 145" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
<polygon fill="#b72206" points="160,18 196,80 124,80"/><circle cx="160" cy="18" fill="#f5c800" r="7"/>
<polygon fill="#38a169" points="124,80 196,80 186,132 134,132"/>
<circle cx="148" cy="104" fill="#fcf9f8" r="14"/><circle cx="148" cy="104" fill="#4f599e" r="7"/>
<polygon fill="#b72206" points="168,110 188,118 168,124"/>
<polygon fill="#f5c800" points="112,132 208,132 194,150 126,150"/></svg>`;

const s = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="square" stroke-linejoin="miter" aria-hidden="true">${d}</svg>`;

export const ICONE = {
  indietro: s('<polyline points="15 5 8 12 15 19"/>'),
  turno: s('<rect x="3" y="6" width="10" height="14" transform="rotate(-10 8 13)"/><rect x="11" y="4" width="10" height="14" transform="rotate(10 16 11)"/>'),
  classifica: s('<rect x="3" y="12" width="5" height="9"/><rect x="9.5" y="5" width="5" height="16"/><rect x="16" y="9" width="5" height="12"/>'),
  storico: s('<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><rect x="3" y="5" width="2" height="2"/><rect x="3" y="11" width="2" height="2"/><rect x="3" y="17" width="2" height="2"/>'),
  altro: s('<rect x="4" y="11" width="2" height="2"/><rect x="11" y="11" width="2" height="2"/><rect x="18" y="11" width="2" height="2"/>'),
  copia: s('<rect x="8" y="8" width="12" height="12"/><polyline points="4 16 4 4 16 4"/>'),
  condividi: s('<polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/><polyline points="4 12 4 21 20 21 20 12"/>'),
  esci: s('<polyline points="10 4 4 4 4 20 10 20"/><polyline points="16 7 21 12 16 17"/><line x1="21" y1="12" x2="9" y2="12"/>'),
  play: s('<polygon points="7 4 20 12 7 20" fill="currentColor"/>'),
  pausa: s('<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>'),
  azzera: s('<polyline points="3 4 3 10 9 10"/><path d="M4.5 15a8 8 0 1 0 1.9-8.3L3 10"/>'),
  piu: s('<line x1="12" y1="4" x2="12" y2="20"/><line x1="4" y1="12" x2="20" y2="12"/>'),
  cestino: s('<polyline points="4 7 20 7"/><path d="M6 7l1 14h10l1-14"/><polyline points="9 7 9 3 15 3 15 7"/>'),
  matita: s('<path d="M4 20l1-5L16 4l4 4L9 19z"/><line x1="13" y1="7" x2="17" y2="11"/>'),
  chiudi: s('<line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/>'),
  freccia: s('<line x1="4" y1="12" x2="20" y2="12"/><polyline points="14 6 20 12 14 18"/>'),
  sorteggio: s('<polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>'),
  scarica: s('<line x1="12" y1="3" x2="12" y2="15"/><polyline points="7 10 12 15 17 10"/><line x1="4" y1="20" x2="20" y2="20"/>'),
  chiave: s('<circle cx="8" cy="14" r="4"/><line x1="11" y1="11" x2="20" y2="2"/><line x1="16" y1="6" x2="19" y2="9"/>'),
  luna: s('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  utenti: s('<circle cx="9" cy="8" r="3.5"/><path d="M2 20c0-4 3-6 7-6s7 2 7 6"/><circle cx="17" cy="9" r="2.5"/><path d="M17 14c3 0 5 2 5 5"/>'),
  campana: s('<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z"/><line x1="10" y1="21" x2="14" y2="21"/>'),
  bandiera: s('<line x1="5" y1="21" x2="5" y2="3"/><polygon points="5 4 19 4 15 9 19 14 5 14"/>'),
  lucchetto: s('<rect x="5" y="11" width="14" height="10"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
};

export const GOOGLE = `<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/><path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/><path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/><path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/></svg>`;

export const SEMI = `<div class="semi" aria-hidden="true">
<svg viewBox="0 0 24 24" fill="#b72206"><polygon points="12,22 2,10 7,4 12,9 17,4 22,10"/></svg>
<svg viewBox="0 0 24 24" fill="#f5c800"><polygon points="12,2 22,12 12,22 2,12" stroke="#1c1b1b" stroke-width="1.5"/></svg>
<svg viewBox="0 0 24 24" fill="#4f599e"><circle cx="12" cy="7" r="4.5"/><circle cx="7" cy="13" r="4.5"/><circle cx="17" cy="13" r="4.5"/><rect x="11" y="13" width="2" height="9"/></svg>
<svg viewBox="0 0 24 24" fill="#1c1b1b"><polygon points="12,2 21,14 15,16 14,14 14,22 10,22 10,14 9,16 3,14"/></svg>
</div>`;
