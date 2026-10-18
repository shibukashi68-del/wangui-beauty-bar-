// Verifies the hero film + categorised gallery.
// Run: node check.mjs
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import { existsSync } from 'node:fs';

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
// jsdom has no media engine; stub play() so autoplay paths don't throw.
dom.window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
dom.window.HTMLMediaElement.prototype.pause = function () { };

const imp = (f) => import(pathToFileURL(path.join(cssDir, f)).href);
const { initApp } = await imp('app.js');
const { navigate } = await imp('router.js');
const { CONFIG } = await imp('config.js');
initApp();

const view = document.getElementById('view');
const results = [];
const check = (n, c, d = '') => results.push({ n, c: !!c, d });

// ── Home: hero film ──
await new Promise(r => setTimeout(r, 30));
const film = view.querySelector('.hero-film');
check('hero film section exists', !!film);
const heroVid = view.querySelector('.hero-film__video');
check('hero video element present', !!heroVid);
check('hero src points at configured file',
  heroVid && heroVid.getAttribute('src') === `/video/${encodeURI(CONFIG.heroVideo)}`,
  heroVid ? heroVid.getAttribute('src') : 'none');
check('hero video file exists on disk',
  existsSync(path.resolve(cssDir, '../video', CONFIG.heroVideo)),
  CONFIG.heroVideo);
check('hero is muted + looping',
  heroVid && heroVid.muted && heroVid.loop);
check('hero headline rendered',
  !!view.querySelector('.hero-film__title'));
check('hero has a booking CTA',
  !!view.querySelector('.hero-film__actions a[href="#/booking"]'));

// ── Home: categorised work ──
const homeSections = view.querySelectorAll('.gallery-section');
check('home shows all four categorised sections', homeSections.length === 4,
  `${homeSections.length} sections`);
const homeTitles = [...view.querySelectorAll('.gallery-section__title')].map(e => e.textContent);
check('home section titles correct',
  homeTitles.join('|') === 'Wigs & Hair|Makeup|Nails|Brows & Lashes', homeTitles.join('|'));

// ── Gallery page: all sections ──
navigate('/gallery');
await new Promise(r => setTimeout(r, 30));
const sections = view.querySelectorAll('.gallery-section');
check('gallery shows all four department sections', sections.length === 4,
  `${sections.length} sections`);

const titles = [...view.querySelectorAll('.gallery-section__title')].map(e => e.textContent);
check('sections are in department order',
  titles.join('|') === 'Wigs & Hair|Makeup|Nails|Brows & Lashes', titles.join('|'));

// Each section must contain only its own department's videos.
const wigSection = [...sections].find(s => s.querySelector('.gallery-section__title').textContent === 'Wigs & Hair');
const makeupSection = [...sections].find(s => s.querySelector('.gallery-section__title').textContent === 'Makeup');
check('wigs section has 17 clips',
  wigSection.querySelectorAll('.video-card').length === 17,
  `${wigSection.querySelectorAll('.video-card').length}`);
check('makeup section has 3 clips',
  makeupSection.querySelectorAll('.video-card').length === 3,
  `${makeupSection.querySelectorAll('.video-card').length}`);

const total = view.querySelectorAll('.video-card').length;
check('all 20 videos shown across sections', total === 20, `${total}`);

// Every wig clip must be wig footage, every makeup clip makeup footage.
const wigFiles = [...wigSection.querySelectorAll('video')].map(v => decodeURI(v.getAttribute('src')));
const makeupFiles = [...makeupSection.querySelectorAll('video')].map(v => decodeURI(v.getAttribute('src')));
check('no makeup clip leaked into wigs section',
  !wigFiles.some(s => /make/i.test(s)), wigFiles.filter(s => /make/i.test(s)).join(','));
check('makeup section is all makeup clips',
  makeupFiles.every(s => /make/i.test(s)), makeupFiles.join(','));

// ── Filter chip narrows to one section ──
const chip = [...view.querySelectorAll('.chip')].find(c => c.textContent === 'Wigs & Hair');
chip.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
await new Promise(r => setTimeout(r, 30));
check('filtering to Wigs shows a single section',
  view.querySelectorAll('.gallery-section').length === 1,
  `${view.querySelectorAll('.gallery-section').length}`);
check('filtered section holds 17 clips',
  view.querySelectorAll('.video-card').length === 17,
  `${view.querySelectorAll('.video-card').length}`);

const failed = results.filter(r => !r.c);
results.forEach(r => console.log(`${r.c ? 'PASS' : 'FAIL'}  ${r.n}${r.d ? `  [${r.d}]` : ''}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
