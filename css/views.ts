// All "pages" as render functions. Everything lives on one HTML document;
// the router swaps content into the single #view outlet.

import { CONFIG, isConfigured } from './config.js';
import { DEPARTMENTS, Department, SERVICES, servicesByDept } from './services.js';
import { serviceCard } from './services-card.js';
import { mountFilters } from './filter.js';
import { mountGallery, mountHeroVideo, mountCategorisedGallery } from './gallery.js';
import { mountVideoAdmin } from './video-admin.js';
import { buildBookingMessage } from './whatsapp-booking.js';
import { navigate } from './router.js';

/** Small helper: set the document title per view. */
function setTitle(suffix: string): void {
  document.title = suffix ? `${suffix} — ${CONFIG.salonName}` : CONFIG.salonName;
}

/** Creates an element with an optional class and inner HTML. */
function el(tag: string, className = '', html = ''): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html) node.innerHTML = html;
  return node;
}

// ─── Home ───────────────────────────────────────────────────────────

export function renderHome(root: HTMLElement): void {
  setTitle('');

  mountHeroVideo(root);

  const intro = el('section', 'section container', `
    <div class="eyebrow">Beauty studio</div>
    <h2 style="margin-top:var(--sp-3)">Luxury beauty care for hair, makeup, nails and self-confidence.</h2>
    <p class="lede" style="margin-top:var(--sp-4)">Thoughtful styling, elevated finishes, and appointments designed around your schedule and your glow.</p>`);

  const stats = el('div', 'stats-grid');
  stats.style.marginTop = 'var(--sp-6)';
  stats.innerHTML = `
    <div class="card"><div class="card__body"><div class="eyebrow">Style</div><h3 class="card__title">Tailored</h3><p class="card__meta">Looks planned around your features, your mood, and your routine.</p></div></div>
    <div class="card"><div class="card__body"><div class="eyebrow">Service</div><h3 class="card__title">4 departments</h3><p class="card__meta">Wigs, makeup, nails and brows designed for everyday confidence.</p></div></div>
    <div class="card"><div class="card__body"><div class="eyebrow">Comfort</div><h3 class="card__title">Calm</h3><p class="card__meta">A clean, relaxed environment with a careful, personal touch.</p></div></div>
    <div class="card"><div class="card__body"><div class="eyebrow">Booking</div><h3 class="card__title">Simple</h3><p class="card__meta">Send your request and confirm the appointment on WhatsApp.</p></div></div>
  `;

  intro.appendChild(stats);

  const experience = el('section', 'section container', `
    <div class="eyebrow">Why clients choose us</div>
    <h2 style="margin-top:var(--sp-3)">A beauty experience that feels polished, personal, and easy.</h2>`);
  const features = el('div', 'story-grid');
  features.style.marginTop = 'var(--sp-6)';
  features.innerHTML = `
    <article class="card"><div class="card__body"><h3 class="card__title">Tailored results</h3><p class="card__meta">Every look is shaped around your features, your preferences, and the style you want to carry with confidence.</p></div></article>
    <article class="card"><div class="card__body"><h3 class="card__title">Clean, comfortable service</h3><p class="card__meta">Professional care in a calm salon environment that keeps you relaxed from the first consultation to the final reveal.</p></div></article>
    <article class="card"><div class="card__body"><h3 class="card__title">Smart booking</h3><p class="card__meta">Choose your service, share your details, and get confirmation through WhatsApp without the stress of back-and-forth.</p></div></article>
  `;
  experience.appendChild(features);

  const story = el('section', 'section container', `
    <div class="story-grid">
      <div class="story-panel">
        <div class="eyebrow">Our approach</div>
        <h2 style="margin-top:var(--sp-3)">Beauty that feels intentional, flattering, and worth repeating.</h2>
        <p class="lede" style="margin-top:var(--sp-4)">We combine great technique with a calm, confident studio experience so you leave looking polished and feeling like yourself — only more elevated.</p>
      </div>
      <div class="card">
        <div class="card__body">
          <div class="eyebrow">Salon promise</div>
          <ul class="feature-list" style="margin-top:var(--sp-4)">
            <li>Thoughtful consultations before each service</li>
            <li>Comfort-first care from start to finish</li>
            <li>Natural, polished results that last beautifully</li>
            <li>Flexible booking and clear follow-up</li>
          </ul>
        </div>
      </div>
    </div>`);

  const signature = el('section', 'section container', `
    <div class="eyebrow">Signature looks</div>
    <h2 style="margin-top:var(--sp-3)">Our most-loved beauty moments.</h2>
    <div class="signature-grid">
      <article class="signature-card"><span class="mini-badge">Best seller</span><h3>Glossy glam</h3><p class="card__meta">Soft glam finish for events, photos, and nights that deserve extra shine.</p></article>
      <article class="signature-card"><span class="mini-badge">Top pick</span><h3>Natural hair luxe</h3><p class="card__meta">Refined wigs and styling that feel effortless, clean, and camera-ready.</p></article>
      <article class="signature-card"><span class="mini-badge">Fresh look</span><h3>Well-groomed nails</h3><p class="card__meta">Clean, elegant finishing touches that make every outfit feel complete.</p></article>
      <article class="signature-card"><span class="mini-badge">Client favorite</span><h3>Flawless brows</h3><p class="card__meta">Shape and definition that instantly lift the entire face and frame your features.</p></article>
    </div>`);

  const depts = el('section', 'section container', `
    <div class="eyebrow">Departments</div>
    <h2 style="margin-top:var(--sp-3)">Beauty services designed to fit your routine.</h2>`);
  const grid = el('div', 'grid grid--4');
  grid.style.marginTop = 'var(--sp-6)';

  Object.entries(DEPARTMENTS).forEach(([key, d]) => {
    const a = document.createElement('a');
    a.className = 'card';
    a.href = `#/dept/${key}`;
    a.innerHTML = `<div class="card__body">
      <h3 class="card__title">${d.title}</h3>
      ${d.blurb ? `<p class="card__meta">${d.blurb}</p>` : ''}
    </div>`;
    grid.appendChild(a);
  });

  depts.appendChild(grid);

  const pricing = el('section', 'section container', `
    <div class="eyebrow">Pricing</div>
    <h2 style="margin-top:var(--sp-3)">Glow-ready services with transparent pricing.</h2>
    <div class="pricing-strip"></div>`);
  const priceList = pricing.querySelector('.pricing-strip') as HTMLElement;
  const featuredServices = ['wig-install', 'bridal-makeup', 'gel-nails', 'lash-extension'];
  featuredServices.forEach((id) => {
    const service = SERVICES.find((item) => item.id === id);
    if (!service) return;
    const card = document.createElement('article');
    card.className = 'card';
    card.innerHTML = `
      <div class="card__body">
        <div class="eyebrow">${service.dept.replace('-', ' ')}</div>
        <h3 class="card__title" style="margin-top:var(--sp-3)">${service.name}</h3>
        <p class="card__meta">${service.description}</p>
        <p style="margin-top:var(--sp-4);font-size:var(--fs-lg);font-weight:600;">KES ${service.price}</p>
      </div>
    `;
    priceList.appendChild(card);
  });

  const pricingFooter = document.createElement('div');
  pricingFooter.style.marginTop = 'var(--sp-5)';
  pricingFooter.innerHTML = `<a class="btn btn--primary" href="#/booking">Book your session</a>`;
  pricing.appendChild(pricingFooter);

  const reviews = el('section', 'section container', `
    <div class="eyebrow">What clients value</div>
    <h2 style="margin-top:var(--sp-3)">A salon experience that feels polished, personal, and easy to repeat.</h2>`);
  const reviewGrid = el('div', 'story-grid');
  reviewGrid.style.marginTop = 'var(--sp-6)';
  reviewGrid.innerHTML = `
    <article class="quote-card"><p>“A polished finish that still feels like you — natural, fresh, and confident.”</p><h3 class="card__title" style="margin-top:var(--sp-4)">Personal styling</h3></article>
    <article class="quote-card"><p>“Simple booking, clear communication, and a calm experience from first message to final look.”</p><h3 class="card__title" style="margin-top:var(--sp-4)">Easy process</h3></article>
    <article class="quote-card"><p>“Thoughtful care, clean details, and beautiful results that are worth coming back for.”</p><h3 class="card__title" style="margin-top:var(--sp-4)">Comfort and care</h3></article>
  `;
  reviews.appendChild(reviewGrid);

  const process = el('section', 'section container', `
    <div class="eyebrow">How it works</div>
    <h2 style="margin-top:var(--sp-3)">From consultation to final glow, it stays simple.</h2>
    <div class="step-grid" style="margin-top:var(--sp-6)">
      <article class="card"><div class="card__body"><div class="step-number">01</div><h3 class="card__title">Pick your service</h3><p class="card__meta">Choose the look, treatment, or beauty service that matches your mood and schedule.</p></div></article>
      <article class="card"><div class="card__body"><div class="step-number">02</div><h3 class="card__title">Share your details</h3><p class="card__meta">Tell us your preferred date, time, and any notes so we can prepare the perfect session.</p></div></article>
      <article class="card"><div class="card__body"><div class="step-number">03</div><h3 class="card__title">We confirm on WhatsApp</h3><p class="card__meta">Once approved, the salon confirms your appointment and helps you get ready for your next glow-up.</p></div></article>
    </div>`);

  const faq = el('section', 'section container', `
    <div class="eyebrow">FAQs</div>
    <h2 style="margin-top:var(--sp-3)">Everything you need before your appointment.</h2>
    <div class="faq-list" style="margin-top:var(--sp-6)">
      <div class="faq-item"><h3>Do I need to pay upfront?</h3><p>No. You simply send your booking request and the salon confirms your session on WhatsApp.</p></div>
      <div class="faq-item"><h3>Can I book for a special event?</h3><p>Yes. Bridal and glam makeup, wig styling, and event-ready beauty services are all available.</p></div>
      <div class="faq-item"><h3>What if I need a different look?</h3><p>Tell us your inspiration, preferred finish, and any concerns in the notes section. We can work around that.</p></div>
    </div>`);

  const work = el('section', 'section container', `
    <div class="eyebrow">Selected work</div>
    <h2 style="margin-top:var(--sp-3)">Recent looks from the studio.</h2>`);
  const workBody = el('div');
  workBody.style.marginTop = 'var(--sp-6)';
  work.appendChild(workBody);
  mountCategorisedGallery(workBody);

  const cta = el('section', 'section container', `
    <div class="card cta-banner">
      <div class="card__body">
        <div>
          <div class="eyebrow">Ready for your next look?</div>
          <h2 style="margin-top:var(--sp-3)">Book a beauty session that makes you feel elevated.</h2>
        </div>
        <div style="display:flex;gap:var(--sp-3);flex-wrap:wrap;">
          <a class="btn btn--primary" href="#/booking">Book an appointment</a>
          <a class="btn btn--ghost" href="https://wa.me/${CONFIG.whatsappNumber}" target="_blank" rel="noopener">Chat on WhatsApp</a>
        </div>
      </div>
    </div>
  `);

  root.append(intro, experience, story, signature, depts, pricing, reviews, process, faq, work, cta);
}

// ─── Department page ────────────────────────────────────────────────

export function renderDepartment(root: HTMLElement, dept: string): void {
  const info = DEPARTMENTS[dept as Department];
  if (!info) {
    renderNotFound(root);
    return;
  }

  setTitle(info.title);

  const hero = el('section', 'dept-hero container', `
    <div class="eyebrow">Department</div>
    <h1>${info.title}</h1>
    <p class="lede">${info.blurb || `Our ${info.title.toLowerCase()} services.`}</p>`);

  const items = servicesByDept(dept as Department);

  const summary = el('section', 'section container', `
    <div class="dept-summary">
      <div class="dept-pill"><span class="eyebrow">Popular picks</span><strong>${items.length}</strong></div>
      <div class="dept-pill"><span class="eyebrow">Average session</span><strong>${dept === 'makeup' ? '90 mins' : dept === 'nails' ? '60 mins' : '90 mins'}</strong></div>
      <div class="dept-pill"><span class="eyebrow">Need a custom look?</span><strong>WhatsApp us</strong></div>
    </div>`);

  const servicesSection = el('section', 'section container', `
    <div class="eyebrow">Services</div>`);
  const grid = el('div', 'grid grid--3');
  grid.style.marginTop = 'var(--sp-5)';
  if (!items.length) {
    grid.innerHTML = `<div class="empty-state">Services for this department will be listed soon. Message us on WhatsApp to ask.</div>`;
  } else {
    items.forEach(s => grid.appendChild(serviceCard(s)));
  }
  servicesSection.appendChild(grid);

  const cta = el('section', 'section container', `
    <div class="card cta-banner">
      <div class="card__body">
        <div>
          <div class="eyebrow">Ready to elevate your look?</div>
          <h2 style="margin-top:var(--sp-3)">Book this service and let us handle the rest.</h2>
        </div>
        <a class="btn btn--primary" href="#/booking?service=${encodeURIComponent(items[0]?.id ?? '')}">Book now</a>
      </div>
    </div>`);

  const gallerySection = el('section', 'section container', `
    <div class="eyebrow">Gallery</div>`);
  const gallery = el('div');
  gallery.style.marginTop = 'var(--sp-5)';
  gallerySection.appendChild(gallery);

  root.append(hero, summary, servicesSection, cta, gallerySection);
  mountGallery(gallery, { dept });
}
// ─── Gallery page ───────────────────────────────────────────────────

export function renderGalleryPage(root: HTMLElement): void {
  setTitle('Gallery');

  const head = el('section', 'section container', `
    <div class="eyebrow">Work</div>
    <h1 style="margin-top:var(--sp-3)">Gallery</h1>
    <p class="lede" style="margin-top:var(--sp-4)">Every look, grouped by department. Tap any clip to watch it full size.</p>`);

  const filterWrap = el('div', 'filters');
  filterWrap.style.marginTop = 'var(--sp-6)';
  const body = el('div');
  body.style.marginTop = 'var(--sp-7)';

  head.append(filterWrap, body);
  root.append(head);

  // 'All' shows the categorised sections; a specific chip shows just that one.
  mountFilters(filterWrap, {
    departments: DEPARTMENTS,
    onChange: (d) => {
      body.innerHTML = '';
      mountCategorisedGallery(body, d);
    },
  });
  mountCategorisedGallery(body);
}

// ─── Booking page ───────────────────────────────────────────────────

export function renderBooking(root: HTMLElement, prefillService = ''): void {
  setTitle('Book');

  const head = el('section', 'section container', `
    <div class="eyebrow">Appointment</div>
    <h1 style="margin-top:var(--sp-3)">Book a beauty session</h1>
    <p class="lede" style="margin-top:var(--sp-4)">Send your request and the salon will confirm your appointment in WhatsApp. We keep the process simple, personal, and easy to manage.</p>`);

  const shell = document.createElement('div');
  shell.className = 'booking-shell';
  shell.style.marginTop = 'var(--sp-6)';

  const infoPanel = document.createElement('aside');
  infoPanel.className = 'booking-info';
  infoPanel.innerHTML = `
    <div class="eyebrow">Your glow-up plan</div>
    <h3 style="margin-top:var(--sp-3)">What happens next?</h3>
    <ul class="feature-list" style="margin-top:var(--sp-4)">
      <li>We review your selected service and preferred time</li>
      <li>We confirm the appointment on WhatsApp</li>
      <li>Your session is prepared to match your style goals</li>
    </ul>
    <div class="booking-note" style="margin-top:var(--sp-5)">Need a custom look or event styling? Add the details in the note box.</div>
  `;

  const form = document.createElement('form');
  form.className = 'form booking-form';
  form.noValidate = true;
  form.innerHTML = `
    <div><label for="name">Name</label><input id="name" required autocomplete="name"></div>
    <div><label for="phone">Phone</label><input id="phone" required autocomplete="tel"></div>
    <div>
      <label for="service">Service</label>
      <select id="service" required></select>
    </div>
    <div class="dual-row"><div><label for="date">Date</label><input id="date" type="date" required></div><div><label for="time">Time</label><input id="time" type="time" required></div></div>
    <div><label for="notes">Notes (optional)</label><textarea id="notes" rows="3"></textarea></div>
    <p class="card__meta">We use these details to prepare your appointment request. Your time is not confirmed until the salon replies, and we only use your information for scheduling.</p>
    <button class="btn btn--wa" type="submit" id="submit-btn">Send booking request</button>
    <p id="notice" class="card__meta" style="display:none"></p>`;

  shell.append(infoPanel, form);
  head.appendChild(shell);
  root.append(head);

  const select = form.querySelector('#service') as HTMLSelectElement;
  const btn = form.querySelector('#submit-btn') as HTMLButtonElement;
  const notice = form.querySelector('#notice') as HTMLElement;

  if (!SERVICES.length) {
    select.innerHTML = `<option value="">General enquiry</option>`;
  } else {
    select.innerHTML = SERVICES.map(s =>
      `<option value="${s.id}" ${s.id === prefillService ? 'selected' : ''}>${s.name}</option>`
    ).join('');
  }

  if (!isConfigured()) {
    btn.disabled = true;
    notice.style.display = 'block';
    notice.textContent = 'Booking is not available yet. Please contact us directly.';
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!form.reportValidity()) return;
    const svc = SERVICES.find(s => s.id === select.value);
    const details = {
      name: (form.querySelector('#name') as HTMLInputElement).value.trim(),
      phone: (form.querySelector('#phone') as HTMLInputElement).value.trim(),
      service: svc ? svc.name : 'General enquiry',
      date: (form.querySelector('#date') as HTMLInputElement).value,
      time: (form.querySelector('#time') as HTMLInputElement).value,
      notes: (form.querySelector('#notes') as HTMLTextAreaElement).value.trim(),
    };
    btn.disabled = true;
    notice.style.display = 'block';
    notice.textContent = 'Sending your request…';
    void fetch('/api/bookings', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...details, serviceId: select.value }),
    }).then(async (response) => {
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to send your request.');
      notice.textContent = `${result.confirmation} Request ID: ${result.booking.id}. `;
      const wa = document.createElement('a');
      wa.className = 'btn btn--wa';
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.href = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(buildBookingMessage(details) + `\nRequest ID: ${result.booking.id}`)}`;
      wa.textContent = 'Continue in WhatsApp';
      notice.appendChild(wa);
      form.reset();
    }).catch((error: Error) => {
      notice.style.display = 'block';
      notice.textContent = error.message || 'Unable to send your request. Please try WhatsApp directly.';
    }).finally(() => { btn.disabled = false; });
  });
}

// ─── Calendar page ──────────────────────────────────────────────────

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[char] as string));
}

/** Staff booking dashboard. Booking data is loaded only after server login. */
export function renderAdmin(root: HTMLElement): void {
  setTitle('Staff bookings');
  const section = el('section', 'section container', `
    <div class="eyebrow">Staff</div>
    <h1 style="margin-top:var(--sp-3)">Booking requests</h1>
    <p class="lede" style="margin-top:var(--sp-4)">Sign in to review requests and update their status.</p>`);
  const panel = el('div');
  panel.style.marginTop = 'var(--sp-6)';
  section.appendChild(panel);
  root.appendChild(section);

  const showError = (message: string) => {
    panel.innerHTML = `<p class="empty-state">${escapeHtml(message)}</p>`;
  };

  const showDashboard = async () => {
    panel.innerHTML = '<p class="card__meta">Loading booking requests…</p>';
    try {
      const response = await fetch('/api/bookings');
      if (!response.ok) throw new Error('Could not load bookings. Sign in again if your session expired.');
      const data = await response.json() as { bookings: Array<Record<string, string>> };
      const header = document.createElement('div');
      header.className = 'form__actions';
      const refresh = document.createElement('button');
      refresh.className = 'btn btn--ghost'; refresh.textContent = 'Refresh';
      refresh.addEventListener('click', () => { void showDashboard(); });
      const logout = document.createElement('button');
      logout.className = 'btn btn--ghost'; logout.textContent = 'Sign out';
      logout.addEventListener('click', async () => {
        await fetch('/api/admin/logout', { method: 'POST' });
        showLogin();
      });
      header.append(refresh, logout);
      const list = document.createElement('div');
      list.className = 'stack';
      list.style.marginTop = 'var(--sp-5)';
      if (!data.bookings.length) list.innerHTML = '<div class="empty-state">No booking requests yet.</div>';
      data.bookings.forEach((booking) => {
        const card = document.createElement('article');
        card.className = 'card';
        const safe = (value: string) => escapeHtml(value);
        card.innerHTML = `<div class="card__body">
          <h2 class="card__title">${safe(booking.service)} · ${safe(booking.date)} at ${safe(booking.time)}</h2>
          <p class="card__meta">${safe(booking.name)} · ${safe(booking.phone)} · ${safe(booking.status)}</p>
          ${booking.notes ? `<p class="card__meta" style="margin-top:var(--sp-2)">${safe(booking.notes)}</p>` : ''}
          <p class="card__meta" style="margin-top:var(--sp-2)">Request ${safe(booking.id)}</p>
          <div style="display:flex;gap:var(--sp-3);align-items:center;margin-top:var(--sp-3)">
            <label for="status-${safe(booking.id)}">Status</label>
            <select id="status-${safe(booking.id)}">
              ${['pending', 'confirmed', 'declined', 'completed'].map(status => `<option value="${status}" ${booking.status === status ? 'selected' : ''}>${status}</option>`).join('')}
            </select><button class="btn btn--primary" type="button">Save</button>
          </div>
        </div>`;
        const selectStatus = card.querySelector('select') as HTMLSelectElement;
        const save = card.querySelector('button') as HTMLButtonElement;
        save.addEventListener('click', async () => {
          save.disabled = true;
          try {
            const updated = await fetch(`/api/bookings/${encodeURIComponent(booking.id)}`, {
              method: 'PATCH', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: selectStatus.value }),
            });
            if (!updated.ok) throw new Error('Could not update this request.');
            void showDashboard();
          } catch (error) { showError((error as Error).message); }
          finally { save.disabled = false; }
        });
        list.appendChild(card);
      });
      panel.replaceChildren(header, list);
    } catch (error) { showError((error as Error).message); }
  };

  const showLogin = () => {
    panel.innerHTML = `<form class="form" style="max-width:420px">
      <div><label for="admin-password">Staff password</label><input id="admin-password" type="password" autocomplete="current-password" required></div>
      <button class="btn btn--primary" type="submit">Sign in</button>
      <p class="card__meta" role="status" aria-live="polite"></p>
    </form>`;
    const form = panel.querySelector('form') as HTMLFormElement;
    const password = form.querySelector('input') as HTMLInputElement;
    const message = form.querySelector('[role="status"]') as HTMLElement;
    form.addEventListener('submit', async (event) => {
      event.preventDefault();
      const button = form.querySelector('button') as HTMLButtonElement;
      button.disabled = true; message.textContent = 'Signing in…';
      try {
        const response = await fetch('/api/admin/login', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ password: password.value }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Sign-in failed.');
        await showDashboard();
      } catch (error) { message.textContent = (error as Error).message; }
      finally { button.disabled = false; }
    });
  };

  void fetch('/api/admin/session').then(response => response.json())
    .then((session: { authenticated: boolean }) => session.authenticated ? showDashboard() : showLogin())
    .catch(() => showError('The booking service is unavailable. Start the site server and try again.'));
}

// ─── Not found ──────────────────────────────────────────────────────

export function renderNotFound(root: HTMLElement): void {
  setTitle('Not found');
  const section = el('section', 'section container', `
    <div class="eyebrow">404</div>
    <h1 style="margin-top:var(--sp-3)">Page not found</h1>
    <p class="lede" style="margin-top:var(--sp-4)">That page does not exist. Head back home to keep browsing.</p>`);
  const actions = el('div');
  actions.style.marginTop = 'var(--sp-6)';
  const back = document.createElement('a');
  back.className = 'btn btn--primary';
  back.href = '#/';
  back.textContent = 'Back home';
  actions.appendChild(back);
  section.appendChild(actions);
  root.appendChild(section);
}

// ─── Route registration ─────────────────────────────────────────────

/** Registers every route on the shared router. Called once from app.ts. */
export function registerRoutes(register: (path: string, render: (ctx: { path: string; params: URLSearchParams }) => void) => void): void {
  register('/', (ctx) => {
    const outlet = document.getElementById('view');
    if (outlet) renderHome(outlet);
  });

  Object.keys(DEPARTMENTS).forEach(key => {
    register(`/dept/${key}`, () => {
      const outlet = document.getElementById('view');
      if (outlet) renderDepartment(outlet, key);
    });
  });

  register('/gallery', () => {
    const outlet = document.getElementById('view');
    if (outlet) renderGalleryPage(outlet);
  });

  register('/booking', (ctx) => {
    const outlet = document.getElementById('view');
    if (outlet) renderBooking(outlet, ctx.params.get('service') ?? '');
  });

  register('/calendar', () => {
    const outlet = document.getElementById('view');
    if (outlet) renderAdmin(outlet);
  });

  register('/admin', () => {
    const outlet = document.getElementById('view');
    if (outlet) renderAdmin(outlet);
  });

  register('/admin/videos', () => {
    const outlet = document.getElementById('view');
    if (outlet) mountVideoAdmin(outlet);
  });
}

/** Convenience for links/buttons that should change view. */
export { navigate };
