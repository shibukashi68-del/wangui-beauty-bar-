// Confirms the rename is consistent: every listed file exists on disk, no
// file is orphaned, and the gallery still builds all tiles.
// Run: node verify.mjs
import { JSDOM } from 'jsdom';
import { pathToFileURL } from 'node:url';
import { readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const cssDir = path.join(root, 'css');
const videoDir = path.join(root, 'video');

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
const { VIDEOS, VIDEO_DIR } = await imp('videos.js');
const { initApp } = await imp('app.js');
const { navigate } = await imp('router.js');

const results = [];
const check = (n, c, d = '') => results.push({ n, c: !!c, d });

// 1. Every listed file exists on disk.
const missing = VIDEOS.filter(v => !existsSync(path.join(root, 'video', v.file)));
check('all listed files exist', missing.length === 0, missing.map(m => m.file).join(', '));

// 2. The renamed file is listed and resolves.
check('frontal ponytail.mp4 is listed',
  VIDEOS.some(v => v.file === 'frontal ponytail.mp4'));
check('frontal ponytail.mp4 exists on disk',
  existsSync(path.join(videoDir, 'frontal ponytail.mp4')));

// 3. No orphaned files on disk.
const listed = new Set(VIDEOS.map(v => v.file));
const orphans = readdirSync(videoDir)
  .filter(f => /\.(mp4|mov|webm)$/i.test(f))
  .filter(f => !listed.has(f));
check('no orphaned videos on disk', orphans.length === 0, orphans.join(', '));

// 4. The gallery still renders every tile.
initApp();
navigate('/gallery');
await new Promise(r => setTimeout(r, 40));
const view = document.getElementById('view');
check('gallery renders 20 tiles',
  view.querySelectorAll('.video-card').length === 20,
  `${view.querySelectorAll('.video-card').length}`);
check('no tile marked unavailable',
  view.querySelectorAll('.video-card.is-unavailable').length === 0);

// 5. Every rendered src maps to a real file.
const srcs = [...view.querySelectorAll('.video-card video')].map(v => decodeURI(v.getAttribute('src')));
const badSrc = srcs.filter(s => !existsSync(path.join(cssDir, s)));
check('every rendered src resolves on disk', badSrc.length === 0, badSrc.join(', '));

const failed = results.filter(r => !r.c);
results.forEach(r => console.log(`${r.c ? 'PASS' : 'FAIL'}  ${r.n}${r.d ? `  [${r.d}]` : ''}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
