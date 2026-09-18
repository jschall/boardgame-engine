/* ORCHARD's rulebook, laid out from rules-data.js (window.RULES: the pages rules.js wrote, with the engine's numbers already in them). Eight pages:
   the cover, the pages of rules.js, and a back cover with the turn summary; the count must be a multiple of four for the booklet. The engine's
   manual/build.js prints this page; page/manual-embed.js embeds it in the game's page. Figures are the real cut files, captured by figures.js. */
const R = window.RULES;
const pages = [];
function page(title, section, body, cls = '') { const p = pages.length + 1; pages.push(`<section class="sheet" id="p${p}"><div class="bleed"></div><article class="page ${cls}"><header class="kicker">${section}</header>${title ? `<h2>${title}</h2>` : ''}<main class="body">${body}</main><footer class="footer"><span>${R.title} · ${section}</span><b>${p}</b></footer></article></section>`); }
const safetyWarning = () => `<aside class="safety-warning" aria-label="Choking hazard warning"><svg class="safety-symbol" viewBox="0 0 100 90" aria-label="Safety alert"><path d="M50 4 L98 87.138 L2 87.138 Z" fill="none" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M45 22 H55 L53 55 H47 Z" fill="currentColor"/><circle cx="50" cy="64.44" r="4.7" fill="currentColor"/></svg><p><strong class="signal">WARNING:</strong> <b>CHOKING HAZARD—</b><br>Small parts. Not for children under 3 yrs.</p></aside>`;
/* the cover: the title, the box's own lid render, the tagline and the players line */
page('', `Rules · ${R.players[0]}–${R.players[R.players.length - 1]} players`, `<h1>${R.title}</h1><figure><img class="hero" src="assets/render-cover.png" alt="The table set for a game"></figure><p class="intro">${R.tagline}</p><p class="subtitle">${R.players[0]} to ${R.players[R.players.length - 1]} players · ${R.minutes} minutes</p>${safetyWarning()}`, 'cover');
for (const [kicker, title, body] of R.pages) page(title, kicker, body);
/* the last page is the turn summary at a glance; pad to a multiple of four with a blank inside page before it */
while ((pages.length + 1) % 4 !== 0) page('', 'Notes', '<p class="note">Notes</p>', 'blank');
page('At a glance', 'Turn reference', `<p>${R.lid.intro}</p>${R.lid.columns.map((c, i) => `<h3>${i + 1} · ${c.heading}</h3><p>${c.text}</p>`).join('')}<p class="note">${R.lid.footer}</p>`);
document.getElementById('book').innerHTML = pages.join('');
window.__manualPageCount = pages.length;
