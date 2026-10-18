import { CONFIG } from './config.js';
import { Service } from './services.js';

export interface ServiceCardOptions {
  base?: string;
  bookHref?: string;
}

export function serviceCard(service: Service, { base = '', bookHref = '#/booking' }: ServiceCardOptions = {}): HTMLElement {
  const currency = CONFIG.currency || '';
  const price = service.price ? `${service.price} ${currency}` : '';

  const el = document.createElement('article');
  el.className = 'service-card';
  el.innerHTML = `
    <div class="service-card__top">
      <span class="service-card__tag">${service.dept.replace('-', ' ')}</span>
      ${price ? `<span class="service-card__price">From ${price}</span>` : ''}
    </div>
    <div class="card__body">
      <h3 class="card__title">${service.name}</h3>
      ${service.description ? `<p class="card__meta">${service.description}</p>` : ''}
      ${service.duration || price ? `<p class="card__meta" style="margin-top:var(--sp-3)">
        ${service.duration || ''}${service.duration && price ? ' · ' : ''}${price}
      </p>` : ''}
      <div style="margin-top:var(--sp-4)">
        <a class="btn btn--ghost" href="${bookHref}?service=${encodeURIComponent(service.id || service.name)}">Book</a>
      </div>
    </div>`;

  return el;
}