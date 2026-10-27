// All "pages" as render functions. Everything lives on one HTML document;
// the router swaps content into the single #view outlet.

import { CONFIG, isConfigured } from './config.js';
import { DEPARTMENTS, Department, SERVICES, servicesByDept } from './services.js';
import { serviceCard } from './services-card.js';
import { mountFilters } from './filter.js';
import { mountGallery, mountHeroVideo, mountCategorisedGallery } from './gallery.js';
import { buildBookingMessage, buildStyleBookingMessage } from './whatsapp-booking.js';
import { navigate } from './router.js';
import { loadVideos, VIDEOS } from './videos.js';
import { renderOwnerDashboard } from './owner.js';

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
    <div class="eyebrow">${CONFIG.address || 'Beauty studio'}</div>
    <h2 style="margin-top:var(--sp-3)">Wigs, makeup, nails and brows &amp; lashes.</h2>
    <p class="lede" style="margin-top:var(--sp-4)">${CONFIG.tagline}</p>`);

  const stats = el('div', 'stats-grid');
  stats.style.marginTop = 'var(--sp-6)';
  stats.innerHTML = `
    <div class="card"><div class="card__body"><div class="eyebrow">Hair</div><h3 class="card__title">Wigs &amp; Hair</h3><p class="card__meta">Browse the currently listed hair services and styles.</p></div></div>
    <div class="card"><div class="card__body"><div class="eyebrow">Makeup</div><h3 class="card__title">Makeup services</h3><p class="card__meta">Natural, glam and bridal makeup are listed.</p></div></div>
    <div class="card"><div class="card__body"><div class="eyebrow">Nails</div><h3 class="card__title">Nail services</h3><p class="card__meta">Manicure, pedicure and gel nail services are listed.</p></div></div>
    <div class="card"><div class="card__body"><div class="eyebrow">Brows &amp; Lashes</div><h3 class="card__title">Brows and lashes</h3><p class="card__meta">Browse brow shaping, tint and lash extensions.</p></div></div>
  `;

  intro.appendChild(stats);

  const experience = el('section', 'section container', `
    <div class="eyebrow">Plan a visit</div>
    <h2 style="margin-top:var(--sp-3)">Browse services and choose how to enquire.</h2>`);
  const features = el('div', 'story-grid');
  features.style.marginTop = 'var(--sp-6)';
  features.innerHTML = `
    <article class="card"><div class="card__body"><h3 class="card__title">Choose a service</h3><p class="card__meta">Review the service list and prices currently shown on the website.</p></div></article>
    <article class="card"><div class="card__body"><h3 class="card__title">Send a request</h3><p class="card__meta">Use the appointment form or prepare a style-specific message in WhatsApp.</p></div></article>
    <article class="card"><div class="card__body"><h3 class="card__title">Wait for confirmation</h3><p class="card__meta">The salon must confirm your preferred appointment time. Requests are not automatically confirmed.</p></div></article>
  `;
  experience.appendChild(features);

  const story = el('section', 'section container', `
    <div class="story-grid">
      <div class="story-panel">
        <div class="eyebrow">Our approach</div>
        <h2 style="margin-top:var(--sp-3)">Wangui Beauty Bar</h2>
        <p class="lede" style="margin-top:var(--sp-4)">${CONFIG.tagline}</p>
      </div>
      <div class="card">
        <div class="card__body">
          <div class="eyebrow">Currently listed</div>
          <ul class="feature-list" style="margin-top:var(--sp-4)">
            <li>Wigs &amp; Hair</li>
            <li>Makeup</li>
            <li>Nails</li>
            <li>Brows &amp; Lashes</li>
          </ul>
        </div>
      </div>
    </div>`);

  const signature = el('section', 'section container', `
    <div class="eyebrow">Service departments</div>
    <h2 style="margin-top:var(--sp-3)">Explore the current service list.</h2>
    <div class="signature-grid">
      <article class="signature-card"><span class="mini-badge">Makeup</span><h3>Natural Makeup</h3><p class="card__meta">Everyday natural look.</p></article>
      <article class="signature-card"><span class="mini-badge">Wigs &amp; Hair</span><h3>Wig Installation</h3><p class="card__meta">Professional wig installation and styling.</p></article>
      <article class="signature-card"><span class="mini-badge">Nails</span><h3>Manicure</h3><p class="card__meta">Classic manicure with polish.</p></article>
      <article class="signature-card"><span class="mini-badge">Brows &amp; Lashes</span><h3>Brow Shaping</h3><p class="card__meta">Threading or waxing brow shape.</p></article>
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
    <div class="eyebrow">Booking options</div>
    <h2 style="margin-top:var(--sp-3)">Choose the request method that suits you.</h2>`);
  const reviewGrid = el('div', 'story-grid');
  reviewGrid.style.marginTop = 'var(--sp-6)';
  reviewGrid.innerHTML = `
    <article class="quote-card"><p>Choose a listed service and provide your preferred date and time.</p><h3 class="card__title" style="margin-top:var(--sp-4)">Appointment form</h3></article>
    <article class="quote-card"><p>Use a video card to prepare a message about a specific style.</p><h3 class="card__title" style="margin-top:var(--sp-4)">Style enquiry</h3></article>
    <article class="quote-card"><p>Both options are requests. The salon will confirm availability.</p><h3 class="card__title" style="margin-top:var(--sp-4)">Confirmation</h3></article>
  `;
  reviews.appendChild(reviewGrid);

  const process = el('section', 'section container', `
    <div class="eyebrow">How it works</div>
    <h2 style="margin-top:var(--sp-3)">How a booking request works.</h2>
    <div class="step-grid" style="margin-top:var(--sp-6)">
      <article class="card"><div class="card__body"><div class="step-number">01</div><h3 class="card__title">Pick a service or style</h3><p class="card__meta">Browse the current service list or choose a video style.</p></div></article>
      <article class="card"><div class="card__body"><div class="step-number">02</div><h3 class="card__title">Send your request</h3><p class="card__meta">Share your name, preferred date and time, and any optional details.</p></div></article>
      <article class="card"><div class="card__body"><div class="step-number">03</div><h3 class="card__title">Wait for salon confirmation</h3><p class="card__meta">Submitting a request does not confirm an appointment or check availability in real time.</p></div></article>
    </div>`);

  const faq = el('section', 'section container', `
    <div class="eyebrow">FAQs</div>
    <h2 style="margin-top:var(--sp-3)">Everything you need before your appointment.</h2>
    <div class="faq-list" style="margin-top:var(--sp-6)">
      <div class="faq-item"><h3>Is my appointment confirmed when I submit?</h3><p>No. The salon must reply to confirm the appointment and availability.</p></div>
      <div class="faq-item"><h3>Can I ask about a style in the gallery?</h3><p>Yes. Use “Book This Style” to prepare a WhatsApp message referencing that clip.</p></div>
      <div class="faq-item"><h3>What if I want a service not listed?</h3><p>Contact the salon to ask whether it is available before making plans.</p></div>
    </div>`);

  const work = el('section', 'section container', `
    <div class="eyebrow">Video gallery</div>
    <h2 style="margin-top:var(--sp-3)">Browse clips by department.</h2>`);
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

  export function renderOtherServices(root: HTMLElement): void {
    setTitle('Other Beauty Services');
    const section = el('section', 'section container', `
      <div class="eyebrow">More from the salon</div>
      <h1 class="page-title">Other Beauty Services</h1>
      <p class="lede">Explore the additional departments currently listed by Wangui Beauty Bar.</p>
      <div class="grid grid--2 service-hub" aria-label="Available beauty departments"></div>`);
    const grid = section.querySelector('.service-hub') as HTMLElement;
    (['nails', 'brows-lashes'] as Department[]).forEach((dept) => {
      const info = DEPARTMENTS[dept];
      const link = document.createElement('a');
      link.className = 'hub-card';
      link.href = `#/dept/${dept}`;
      const title = document.createElement('h2');
      title.textContent = info.title;
      const blurb = document.createElement('p');
      blurb.textContent = info.blurb;
      link.append(title, blurb);
      grid.appendChild(link);
    });
    root.appendChild(section);
  }

  export function renderOccasions(root: HTMLElement): void {
    setTitle('Bridal & Special Occasions');
    const section = el('section', 'section container', `
      <div class="eyebrow">For your occasion</div>
      <h1 class="page-title">Bridal &amp; Special Occasions</h1>
      <p class="lede">The current service list includes bridal and glam makeup. Ask the salon about your event and preferred look.</p>
      <div class="grid grid--2 occasion-services" aria-label="Occasion makeup services"></div>`);
    const grid = section.querySelector('.occasion-services') as HTMLElement;
    SERVICES.filter((service) => ['bridal-makeup', 'glam-makeup'].includes(service.id))
      .forEach((service) => grid.appendChild(serviceCard(service)));
    root.appendChild(section);
  }

  export function renderContact(root: HTMLElement): void {
    setTitle('Contact');
    const section = el('section', 'section container contact-page', `
      <div class="eyebrow">Visit or get in touch</div>
      <h1 class="page-title">Contact Wangui Beauty Bar</h1>
      <p class="lede">Send a booking request and wait for the salon to confirm your appointment and availability.</p>
      <div class="contact-grid">
        <article class="contact-panel"><span class="eyebrow">Address</span><p>${CONFIG.address || 'Please contact us for location details.'}</p></article>
        <article class="contact-panel"><span class="eyebrow">Phone</span><p>${CONFIG.phoneDisplay || 'Contact details not configured.'}</p></article>
        <article class="contact-panel"><span class="eyebrow">Opening hours</span><p>${CONFIG.businessHours.length
      ? CONFIG.businessHours.map((hours) => `${hours.day}: ${hours.hours}`).join('<br>')
      : 'Please contact us for opening hours.'}</p></article>
      </div>`);
    const actions = document.createElement('div');
    actions.className = 'contact-actions';
    if (CONFIG.whatsappNumber) {
      const link = document.createElement('a');
      link.className = 'btn btn--primary';
      link.href = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(`Hello ${CONFIG.salonName}, I would like to ask about an appointment.`)}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'Message us on WhatsApp';
      actions.appendChild(link);
    }
    section.appendChild(actions);
    root.appendChild(section);
  }

  export async function renderWhatsAppBooking(root: HTMLElement, params: URLSearchParams): Promise<void> {
    setTitle('Book via WhatsApp');
    await loadVideos();

    const service = SERVICES.find((item) => item.id === params.get('serviceId'));
    const video = VIDEOS.find((item) => item.file === params.get('styleFile'));
    const selection = service
      ? {
        service: service.name,
        category: DEPARTMENTS[service.dept].title,
        style: service.name,
        priceKes: service.price || null,
      }
      : video
        ? {
          service: video.caption,
          category: video.category || DEPARTMENTS[video.dept].title,
          style: video.caption,
          reference: video.file,
          priceKes: video.priceKes ?? null,
        }
        : {
          service: 'Beauty service enquiry',
          category: 'Please describe your preferred service',
          style: 'To be discussed',
          priceKes: null,
        };

    const section = el('section', 'section container whatsapp-booking-page', `
      <div class="eyebrow">A personal booking request</div>
      <h1 class="page-title">Book via WhatsApp</h1>
      <p class="lede">Share your preferred date and time. WhatsApp will open with a message for you to review and send. The salon must confirm availability; this is not an automatic booking.</p>
      <div class="selection-summary">
        <p><span>Service</span><strong class="selection-service"></strong></p>
        <p><span>Category</span><strong class="selection-category"></strong></p>
        <p><span>Style</span><strong class="selection-style"></strong></p>
        <p><span>Price</span><strong class="selection-price"></strong></p>
      </div>
      <form class="form whatsapp-booking-form">
        <div><label for="wa-name">Your name</label><input id="wa-name" name="name" autocomplete="name" required></div>
        <div class="dual-row">
          <div><label for="wa-date">Preferred date</label><input id="wa-date" name="date" type="date" required></div>
          <div><label for="wa-time">Preferred time</label><input id="wa-time" name="time" type="time" required></div>
        </div>
        <div><label for="wa-request">Anything you would like us to know? (optional)</label><textarea id="wa-request" name="request" rows="3"></textarea></div>
        <button class="btn btn--primary" type="submit">Prepare WhatsApp message</button>
        <p class="card__meta" role="status" aria-live="polite">Your message is not sent until you press Send in WhatsApp.</p>
      </form>`);

    (section.querySelector('.selection-service') as HTMLElement).textContent = selection.service;
    (section.querySelector('.selection-category') as HTMLElement).textContent = selection.category;
    (section.querySelector('.selection-style') as HTMLElement).textContent = selection.style;
    (section.querySelector('.selection-price') as HTMLElement).textContent = selection.priceKes === null
      ? 'Price confirmation required'
      : `KES ${new Intl.NumberFormat('en-KE').format(selection.priceKes)}`;

    const form = section.querySelector('form') as HTMLFormElement;
    const status = form.querySelector('[role="status"]') as HTMLElement;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (!form.reportValidity() || !CONFIG.whatsappNumber) return;
      const details = {
        ...selection,
        name: (form.querySelector('#wa-name') as HTMLInputElement).value.trim(),
        date: (form.querySelector('#wa-date') as HTMLInputElement).value,
        time: (form.querySelector('#wa-time') as HTMLInputElement).value,
        request: (form.querySelector('#wa-request') as HTMLTextAreaElement).value.trim(),
      };
      const link = document.createElement('a');
      link.className = 'btn btn--wa';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.href = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(buildStyleBookingMessage(details))}`;
      link.textContent = 'Continue to WhatsApp';
      status.textContent = 'Review your request, continue to WhatsApp, then press Send. The salon will confirm availability.';
      status.appendChild(document.createTextNode(' '));
      status.appendChild(link);
    });
    root.appendChild(section);
  }

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
    }).catch(() => {
      notice.style.display = 'block';
      notice.replaceChildren(document.createTextNode(
        'The website could not confirm that your request was recorded. Contact the salon on WhatsApp to check before sending it again. Your appointment is not confirmed. ',
      ));
      const wa = document.createElement('a');
      wa.className = 'btn btn--wa';
      wa.target = '_blank';
      wa.rel = 'noopener';
      wa.href = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(
        `This appointment is not confirmed. The website could not confirm whether this request was recorded. Please check before entering it again.\n\n${buildBookingMessage(details)}`,
      )}`;
      wa.textContent = 'Follow up in WhatsApp';
      notice.appendChild(wa);
    }).finally(() => { btn.disabled = false; });
  });
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

  register('/other-services', () => {
    const outlet = document.getElementById('view');
    if (outlet) renderOtherServices(outlet);
  });

  register('/occasions', () => {
    const outlet = document.getElementById('view');
    if (outlet) renderOccasions(outlet);
  });

  register('/contact', () => {
    const outlet = document.getElementById('view');
    if (outlet) renderContact(outlet);
  });

  register('/whatsapp-booking', (ctx) => {
    const outlet = document.getElementById('view');
    if (outlet) void renderWhatsAppBooking(outlet, ctx.params);
  });

  register('/booking', (ctx) => {
    const outlet = document.getElementById('view');
    if (outlet) renderBooking(outlet, ctx.params.get('service') ?? '');
  });

  register('/owner', () => {
    const outlet = document.getElementById('view');
    if (outlet) void renderOwnerDashboard(outlet);
  });

}

/** Convenience for links/buttons that should change view. */
export { navigate };
