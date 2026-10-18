// Renders the gallery view in a DOM and asserts the video tiles are built
// with correct src paths. Run: node gallery-check.mjs
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const cssDir = path.resolve('css');
const dom = new JSDOM(
  `<!DOCTYPE html><html><head><title>t</title></head>
   <body><div id="app"><main id="view"></main></div></body></html>`,
  { url: 'http://localhost/', pretendToBeVisual: true }
);

globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.URLSearchParams = dom.window.URLSearchParams;
dom.window.scrollTo = () => { };

const imp = (f) => import(pathToFileURL(path.join(cssDir, f)).href);
const { initApp } = await imp('app.js');
const { navigate } = await imp('router.js');
initApp();

navigate('/gallery');
await new Promise(r => setTimeout(r, 30));

const view = document.getElementById('view');
const tiles = view.querySelectorAll('.video-card');
const videos = view.querySelectorAll('.video-card video');
const chips = view.querySelectorAll('.filters .chip');

const results = [];
const check = (n, c, d = '') => results.push({ n, c: !!c, d });

check('gallery tiles rendered', tiles.length === 20, `${tiles.length} tiles`);
check('every tile has a video', videos.length === 20, `${videos.length} videos`);
check('filter chips present', chips.length === 5, `${chips.length} chips`);

const srcs = [...videos].map(v => v.getAttribute('src'));
const badSrc = srcs.filter(s => !s.startsWith('../video/'));
check('all srcs use ../video/ prefix', badSrc.length === 0, badSrc.join(', '));

const encoded = srcs.filter(s => s.includes(' '));
check('spaces are URL-encoded', encoded.length === 0, encoded.slice(0, 2).join(', '));

check('tiles are not display:none',
  ![...tiles].some(t => t.style.display === 'none'));

// Filtering to makeup should show exactly 3.
navigate('/gallery');
await new Promise(r => setTimeout(r, 10));
const makeupChip = [...view.querySelectorAll('.chip')].find(c => c.textContent === 'Makeup');
makeupChip.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 30));
check('filtering to Makeup shows 3 tiles',
  view.querySelectorAll('.video-card').length === 3,
  `${view.querySelectorAll('.video-card').length} tiles`);

const failed = results.filter(r => !r.c);
results.forEach(r => console.log(`${r.c ? 'PASS' : 'FAIL'}  ${r.n}${r.d ? `  [${r.d}]` : ''}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
