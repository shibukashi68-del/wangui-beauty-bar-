import { CONFIG } from './config.js';
import { Service } from './services.js';

export interface ServiceCardOptions {
  base?: string;
  bookHref?: string;
}

export function serviceCard(service: Service, { base = '', bookHref = '#/booking' }: ServiceCardOptions = {}): HTMLElement {
  const currency = CONFIG.currency || '';
  const price = service.price ? `${currency} ${new Intl.NumberFormat('en-KE').format(service.price)}` : '';
  const whatsappHref = `#/whatsapp-booking?${new URLSearchParams({ serviceId: service.id })}`;

  const el = document.createElement('article');
  el.className = 'service-card';
  el.innerHTML = `
    <div class="service-card__top">
      <span class="service-card__tag">${service.dept.replace('-', ' ')}</span>
      ${price ? `<span class="service-card__price">${price}</span>` : '<span class="service-card__price">Price confirmation required</span>'}
    </div>
    <div class="card__body">
      <h3 class="card__title">${service.name}</h3>
      ${service.description ? `<p class="card__meta">${service.description}</p>` : ''}
      ${service.duration && service.duration !== '—' ? `<p class="card__meta service-card__duration">${service.duration}</p>` : ''}
      <div class="service-card__actions">
        <a class="btn btn--ghost" href="${bookHref}?service=${encodeURIComponent(service.id || service.name)}">Request appointment</a>
        <a class="btn btn--primary" href="${whatsappHref}">Book via WhatsApp</a>
      </div>
    </div>`;

  return el;
}