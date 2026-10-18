// Full verification of the recent changes.
// Run: node verify-all.mjs
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cssDir = path.join(root, 'css');
const videoDir = path.join(root, 'video');
const localVideoPath = (src) => path.join(videoDir, decodeURIComponent(src.replace(/^\/video\//, '')));

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
dom.window.HTMLMediaElement.prototype.play = function () { return Promise.resolve(); };
dom.window.HTMLMediaElement.prototype.pause = function () { };

const imp = (f) => import(pathToFileURL(path.join(cssDir, f)).href);
const { CONFIG } = await imp('config.js');
const { VIDEOS } = await imp('videos.js');
const { SERVICES, DEPARTMENTS } = await imp('services.js');
const { initApp } = await imp('app.js');
const { navigate } = await imp('router.js');

const results = [];
const check = (n, c, d = '') => results.push({ n, c: !!c, d });

// ── 1. Renames ──
check('no typo filenames remain',
  !readdirSync(videoDir).some(f => /istall|instollation|porny/i.test(f)),
  readdirSync(videoDir).filter(f => /istall|instollation|porny/i.test(f)).join(', '));
check('hero file exists', existsSync(path.join(videoDir, CONFIG.heroVideo)), CONFIG.heroVideo);
check('frontal-installation.mp4 exists',
  existsSync(path.join(videoDir, 'frontal-installation.mp4')));

// ── 2. Video integrity ──
const missing = VIDEOS.filter(v => !existsSync(path.join(videoDir, v.file)));
check('all listed videos exist', missing.length === 0, missing.map(m => m.file).join(', '));
const listed = new Set(VIDEOS.map(v => v.file));
const orphans = readdirSync(videoDir)
  .filter(f => /\.(mp4|mov|webm)$/i.test(f))
  .filter(f => f !== CONFIG.heroVideo)
  .filter(f => !listed.has(f));
check('no orphaned videos', orphans.length === 0, orphans.join(', '));

// ── 3. Prices match the advertised KES figures in the videos ──
const byId = Object.fromEntries(SERVICES.map(s => [s.id, s]));
check('wig install = KES 1,000 (video: "Install — KES 1,000")',
  byId['wig-install'].price === 1000, String(byId['wig-install'].price));
check('natural makeup = KES 800 (video: "Makeup — KES 800")',
  byId['natural-makeup'].price === 800, String(byId['natural-makeup'].price));
check('glam makeup = KES 2,000 (video: "Makeup — KES 2,000")',
  byId['glam-makeup'].price === 2000, String(byId['glam-makeup'].price));
check('wig purchase = KES 7,000 (video: "Wig — KES 7,000")',
  byId['wig-purchase'].price === 7000, String(byId['wig-purchase'].price));

// ── 4. Department blurbs filled ──
const blankBlurbs = Object.values(DEPARTMENTS).filter(d => !d.blurb);
check('every department has a blurb', blankBlurbs.length === 0,
  blankBlurbs.map(d => d.title).join(', '));

// ── 5. Gallery shows all 4 departments, incl. coming-soon ones ──
initApp();
navigate('/gallery');
await new Promise(r => setTimeout(r, 40));
const view = document.getElementById('view');
const sections = view.querySelectorAll('.gallery-section');
check('gallery shows all 4 departments', sections.length === 4, `${sections.length}`);

const titles = [...view.querySelectorAll('.gallery-section__title')].map(e => e.textContent);
check('all four departments present in order',
  titles.join('|') === 'Wigs & Hair|Makeup|Nails|Brows & Lashes', titles.join('|'));

check('nails shows coming-soon state',
  view.textContent.includes('Clips coming soon'));
check('20 real tiles still render',
  view.querySelectorAll('.video-card').length === 20,
  `${view.querySelectorAll('.video-card').length}`);
check('coming-soon sections have no tiles',
  view.querySelectorAll('.empty-state--soon').length === 2,
  `${view.querySelectorAll('.empty-state--soon').length}`);

// ── 6. Home hero still works ──
navigate('/');
await new Promise(r => setTimeout(r, 30));
const heroVid = view.querySelector('.hero-film__video');
check('hero video renders', !!heroVid);
check('hero src resolves on disk',
  heroVid && existsSync(localVideoPath(heroVid.getAttribute('src'))),
  heroVid ? heroVid.getAttribute('src') : 'none');

// ── 7. Every rendered src resolves ──
navigate('/gallery');
await new Promise(r => setTimeout(r, 40));
const srcs = [...view.querySelectorAll('.video-card video')].map(v => decodeURI(v.getAttribute('src')));
const badSrc = srcs.filter(s => !existsSync(localVideoPath(s)));
check('every rendered src resolves', badSrc.length === 0, badSrc.join(', '));

// ── 8. Services count ──
check('14 services across 4 departments', SERVICES.length === 14, `${SERVICES.length}`);

const failed = results.filter(r => !r.c);
results.forEach(r => console.log(`${r.c ? 'PASS' : 'FAIL'}  ${r.n}${r.d ? `  [${r.d}]` : ''}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
