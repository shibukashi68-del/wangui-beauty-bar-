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
async function navigateAndWait(path) {
  const nextHash = `#${path}`;
  const hashChange = new Promise(resolve => window.addEventListener('hashchange', resolve, { once: true }));
  navigate(path);
  if (location.hash === nextHash) await hashChange;
}

check('footer has no staff sign-in link', !document.querySelector('.site-footer a[href="#/admin"]'));
check('footer links to the private owner dashboard', !!document.querySelector('.site-footer a[href="#/owner"]'));
await navigateAndWait('/admin');
check('staff dashboard route is unavailable',
  view.querySelector('h1')?.textContent === 'Page not found',
  view.querySelector('h1')?.textContent || 'no heading');
await navigateAndWait('/admin/videos');
check('video management route is unavailable',
  view.querySelector('h1')?.textContent === 'Page not found',
  view.querySelector('h1')?.textContent || 'no heading');
globalThis.fetch = async (url) => ({
  ok: true,
  json: async () => String(url) === '/api/admin/config' ? { configured: false } : {},
});
await navigateAndWait('/owner');
await new Promise(r => setTimeout(r, 10));
check('owner dashboard route renders without admin setup',
  view.querySelector('.owner-page h1')?.textContent === 'Video gallery manager');
check('unconfigured owner publishing explains required setup',
  view.querySelector('.owner-message')?.textContent.includes('not configured yet'));

// ── Home: hero film ──
navigate('/');
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
const styleBookingLink = view.querySelector('.video-card__actions a');
const styleBookingParams = new URLSearchParams(styleBookingLink?.getAttribute('href')?.split('?')[1] || '');
check('gallery style has a direct booking link', !!styleBookingLink);
check('gallery style reference preserves its filename', styleBookingParams.get('styleFile') === 'wig-install-hero.mp4');
check('video cards require customer action to play', [...view.querySelectorAll('.video-card video')].every(v => v.preload === 'none'));
const spacedVideo = [...view.querySelectorAll('.video-card video')].find(v => v.src.includes('wig%20installation.mp4'));
check('video filename spaces are URL-encoded', !!spacedVideo);
check('every catalogued gallery path exists',
  [...view.querySelectorAll('.video-card video')].every(v => {
    const filename = decodeURIComponent(new URL(v.src).pathname.slice('/video/'.length));
    return existsSync(path.resolve(cssDir, '../video', filename));
  }));
check('unverified gallery prices require confirmation',
  [...view.querySelectorAll('.video-card__price')].every(p => p.textContent === 'Price confirmation required'));
const playButton = view.querySelector('.video-card__play');
playButton?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
check('play button opens an on-demand video player',
  !!document.querySelector('.lightbox video[controls]'));
document.querySelector('.lightbox__close')?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }));
check('video player closes cleanly', !document.querySelector('.lightbox'));

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

// ── Direct WhatsApp style booking ──
navigate('/whatsapp-booking', { serviceId: 'wig-install' });
await new Promise(r => setTimeout(r, 30));
check('direct WhatsApp booking route renders', !!view.querySelector('.whatsapp-booking-form'));
check('service booking shows configured service and price',
  view.querySelector('.selection-service')?.textContent === 'Wig Installation'
    && view.querySelector('.selection-price')?.textContent === 'KES 1,000');
const bookingForm = view.querySelector('.whatsapp-booking-form');
if (bookingForm) {
  bookingForm.querySelector('#wa-name').value = 'Amina';
  bookingForm.querySelector('#wa-date').value = '2026-10-29';
  bookingForm.querySelector('#wa-time').value = '14:30';
  bookingForm.querySelector('#wa-request').value = 'Fringe & ginger reference';
  bookingForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
}
const whatsappLink = view.querySelector('.whatsapp-booking-form [role="status"] a');
const whatsappText = whatsappLink ? new URL(whatsappLink.href).searchParams.get('text') || '' : '';
check('WhatsApp draft URL targets the configured salon number',
  whatsappLink?.href.startsWith(`https://wa.me/${CONFIG.whatsappNumber}?text=`));
check('WhatsApp draft includes the request details',
  ['Wangui Beauty Bar', 'Wig Installation', 'KES 1,000', 'Amina', '2026-10-29', '14:30', 'Fringe & ginger reference']
    .every(value => whatsappText.includes(value)));
check('WhatsApp draft requires the salon to confirm',
  whatsappText.includes('not yet confirmed'));

navigate('/whatsapp-booking', { styleFile: 'wig @ 7k.mp4' });
await new Promise(r => setTimeout(r, 30));
check('unverified video prices are not advertised',
  view.querySelector('.selection-price')?.textContent === 'Price confirmation required');
check('video style booking includes the catalogue reference',
  view.querySelector('.selection-style')?.textContent === 'Wig style');

// ── Added navigation destinations ──
navigate('/other-services');
await new Promise(r => setTimeout(r, 30));
check('other beauty page links to existing departments',
  view.querySelectorAll('.service-hub a').length === 2);
navigate('/occasions');
await new Promise(r => setTimeout(r, 30));
const occasionServiceNames = [...view.querySelectorAll('.service-card .card__title')]
  .map(el => el.textContent)
  .sort()
  .join('|');
check('occasions page lists only existing bridal and glam services',
  occasionServiceNames === 'Bridal Makeup|Glam Makeup',
  occasionServiceNames);
navigate('/contact');
await new Promise(r => setTimeout(r, 30));
check('contact page uses configured business details',
  view.textContent.includes(CONFIG.address) && view.textContent.includes(CONFIG.phoneDisplay));

// ── Database failure still offers a truthful WhatsApp follow-up ──
navigate('/booking');
await new Promise(r => setTimeout(r, 30));
const appointmentForm = view.querySelector('.booking-form');
if (appointmentForm) {
  appointmentForm.querySelector('#name').value = 'Test Client';
  appointmentForm.querySelector('#phone').value = '+254700000000';
  appointmentForm.querySelector('#date').value = '2026-10-29';
  appointmentForm.querySelector('#time').value = '14:30';
  appointmentForm.reportValidity = () => true;
}
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Database unavailable'); };
appointmentForm?.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
await new Promise(r => setTimeout(r, 30));
const fallbackLink = view.querySelector('#notice a');
const fallbackMessage = fallbackLink
  ? new URL(fallbackLink.href).searchParams.get('text') || ''
  : '';
check('database failure offers a WhatsApp booking follow-up',
  fallbackLink?.textContent === 'Follow up in WhatsApp'
    && fallbackLink.href.startsWith(`https://wa.me/${CONFIG.whatsappNumber}?text=`));
check('WhatsApp fallback includes appointment details and avoids claiming confirmation',
  ['Test Client', '+254700000000', '2026-10-29', '14:30', 'not confirmed']
    .every(value => fallbackMessage.includes(value))
    && view.querySelector('#notice').textContent.includes('Your appointment is not confirmed.'));
globalThis.fetch = originalFetch;

const failed = results.filter(r => !r.c);
results.forEach(r => console.log(`${r.c ? 'PASS' : 'FAIL'}  ${r.n}${r.d ? `  [${r.d}]` : ''}`));
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
