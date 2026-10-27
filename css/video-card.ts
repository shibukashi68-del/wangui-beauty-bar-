import { VIDEO_DIR, Video } from './videos.js';

export interface VideoCardOptions {
  /** Optional path prefix (kept for API compatibility; normally unused). */
  base?: string;
  /** Called when the tile is activated, to open a full-size viewer. */
  onOpen?: (video: Video) => void;
}

export function videoCard(video: Video, { base = '', onOpen }: VideoCardOptions = {}): HTMLElement {
  const wrap = document.createElement('article');
  wrap.className = 'video-card';

  const vid = document.createElement('video');
  vid.src = video.url || `${base}${VIDEO_DIR}${encodeURI(video.file)}`;
  vid.muted = true;
  vid.playsInline = true;
  vid.preload = 'none';
  vid.setAttribute('playsinline', '');
  vid.setAttribute('aria-hidden', 'true');
  vid.setAttribute('tabindex', '-1');

  vid.addEventListener('loadedmetadata', () => {
    try {
      vid.currentTime = 0.1;
    } catch {
      // The tile remains a usable play card if the browser cannot seek yet.
    }
  });
  vid.addEventListener('loadeddata', () => wrap.classList.add('is-ready'));
  vid.addEventListener('error', () => {
    wrap.classList.add('is-unavailable');
  });

  const media = document.createElement('div');
  media.className = 'video-card__media';
  media.appendChild(vid);

  const play = document.createElement('button');
  play.className = 'video-card__play';
  play.type = 'button';
  play.setAttribute('aria-label', `Play ${video.caption || video.file}`);
  play.addEventListener('click', () => onOpen?.(video));
  media.appendChild(play);

  const details = document.createElement('div');
  details.className = 'video-card__details';

  const category = document.createElement('p');
  category.className = 'video-card__category';
  category.textContent = video.category || video.dept.replace('-', ' ');

  const caption = document.createElement('h3');
  caption.className = 'video-card__title';
  caption.textContent = video.caption || video.file;

  const price = document.createElement('p');
  price.className = 'video-card__price';
  price.textContent = video.priceKes == null
    ? 'Price confirmation required'
    : `KES ${new Intl.NumberFormat('en-KE').format(video.priceKes)}`;

  const review = document.createElement('p');
  review.className = 'video-card__review';
  review.textContent = video.reviewRequired ? 'Description based on filename — review needed' : '';

  const actions = document.createElement('div');
  actions.className = 'video-card__actions';
  const playLink = document.createElement('button');
  playLink.className = 'btn btn--ghost';
  playLink.type = 'button';
  playLink.textContent = 'Play video';
  playLink.addEventListener('click', () => onOpen?.(video));

  const book = document.createElement('a');
  book.className = 'btn btn--primary';
  book.href = `#/whatsapp-booking?${new URLSearchParams({ styleFile: video.file })}`;
  book.textContent = 'Book This Style';

  actions.append(playLink, book);
  details.append(category, caption, price);
  if (review.textContent) details.appendChild(review);
  details.appendChild(actions);
  wrap.append(media, details);

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        vid.preload = 'metadata';
        observer.disconnect();
      }
    }, { rootMargin: '160px' });
    observer.observe(wrap);
  }

  return wrap;
}