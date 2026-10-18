import { CONFIG } from './config.js';
import { VIDEO_DIR, VIDEOS, Video, loadVideos } from './videos.js';
import { videoCard } from './video-card.js';

export interface GalleryOptions {
  base?: string;
  dept?: string;
}

/** Departments in the order they should appear, with a display title. */
const SECTION_ORDER: Array<{ key: Video['dept']; title: string; blurb: string }> = [
  { key: 'wigs-hair',    title: 'Wigs & Hair',    blurb: 'Installations, frontals and styling.' },
  { key: 'makeup',       title: 'Makeup',         blurb: 'Natural, glam and bridal looks.' },
  { key: 'nails',        title: 'Nails',          blurb: 'Manicures, pedicures and gel.' },
  { key: 'brows-lashes', title: 'Brows & Lashes', blurb: 'Shaping, tinting and extensions.' },
];

/** Opens a full-size, unmuted viewer for one video. */
export async function openViewer(video: Video): Promise<void> {
  const overlay = document.createElement('div');
  overlay.className = 'lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', video.caption || video.file);

  const player = document.createElement('video');
  player.src = `${VIDEO_DIR}${encodeURI(video.file)}`;
  player.controls = true;
  player.autoplay = true;
  player.loop = true;
  player.playsInline = true;
  player.setAttribute('playsinline', '');

  const close = document.createElement('button');
  close.className = 'lightbox__close';
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.innerHTML = '&times;';

  const caption = document.createElement('p');
  caption.className = 'lightbox__caption';
  caption.textContent = video.caption || '';

  overlay.append(player, close, caption);
  document.body.appendChild(overlay);
  document.body.classList.add('is-locked');

  const dismiss = () => {
    player.pause();
    overlay.remove();
    document.body.classList.remove('is-locked');
    document.removeEventListener('keydown', onKey);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') dismiss();
  };

  close.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) dismiss();
  });
  document.addEventListener('keydown', onKey);
}

/**
 * The opening hero film: a full-bleed autoplaying clip with the studio
 * headline over it. Falls back to a still, text-only hero if the file is
 * missing, so the home page is never empty.
 */
export function mountHeroVideo(root: HTMLElement): void {
  const file = CONFIG.heroVideo;

  const section = document.createElement('section');
  section.className = 'hero-film';

  if (file) {
    const vid = document.createElement('video');
    vid.className = 'hero-film__video';
    vid.src = `${VIDEO_DIR}${encodeURI(file)}`;
    vid.muted = true;
    vid.loop = true;
    vid.autoplay = true;
    vid.playsInline = true;
    vid.preload = 'auto';
    vid.setAttribute('playsinline', '');
    vid.setAttribute('aria-hidden', 'true');
    // If the file is missing, drop the video and keep the text hero.
    vid.addEventListener('error', () => {
      vid.remove();
      section.classList.remove('has-video');
    });
    // Autoplay can be blocked; treat that as a still-image hero.
    vid.addEventListener('loadeddata', () => section.classList.add('has-video'));
    vid.play?.().catch(() => {});
    section.appendChild(vid);
  }

  const overlay = document.createElement('div');
  overlay.className = 'hero-film__overlay';
  overlay.innerHTML = `
    <div class="hero-film__inner container">
      <div class="eyebrow">${CONFIG.salonName}</div>
      <h1 class="hero-film__title">${CONFIG.heroHeadline || CONFIG.tagline}</h1>
      <p class="hero-film__sub">${CONFIG.tagline}</p>
      <div class="hero-film__actions">
        <a class="btn btn--primary" href="#/booking">Book an appointment</a>
        <a class="btn btn--ghost hero-film__ghost" href="#/gallery">Explore the work</a>
      </div>
    </div>`;

  section.appendChild(overlay);
  root.appendChild(section);
}

/**
 * Renders the gallery grouped into department sections, so every wig sits
 * together, every makeup look together, and so on.
 *
 * @param onlyDept when set, renders just that one section.
 */
export async function mountCategorisedGallery(root: HTMLElement, onlyDept = ''): Promise<void> {
  await loadVideos();
  const sections = onlyDept
    ? SECTION_ORDER.filter(s => s.key === onlyDept)
    : SECTION_ORDER;

  sections.forEach(({ key, title, blurb }) => {
    const items = VIDEOS.filter(v => v.dept === key);

    const section = document.createElement('section');
    section.className = 'gallery-section';

    const heading = document.createElement('header');
    heading.className = 'gallery-section__head';
    heading.innerHTML = `
      <div>
        <h2 class="gallery-section__title">${title}</h2>
        <p class="gallery-section__blurb">${blurb}</p>
      </div>
      <a class="gallery-section__link" href="#/dept/${key}">View ${title} services</a>`;

    section.appendChild(heading);

    if (items.length) {
      const grid = document.createElement('div');
      grid.className = 'gallery-masonry';
      items.forEach(v => grid.appendChild(videoCard(v, { onOpen: openViewer })));
      section.appendChild(grid);
    } else {
      // No footage yet — still show the department so nothing looks missing.
      const empty = document.createElement('div');
      empty.className = 'empty-state empty-state--soon';
      empty.innerHTML = `
        <p>Clips coming soon.</p>
        <p style="margin-top:var(--sp-2)">Message us on WhatsApp to see recent ${title.toLowerCase()} work.</p>`;
      section.appendChild(empty);
    }

    root.appendChild(section);
  });
}

export async function mountGallery(root: HTMLElement, { base = '', dept = '' }: GalleryOptions = {}): Promise<void> {
  await loadVideos();
  const items: Video[] = dept ? VIDEOS.filter(v => v.dept === (dept as Video['dept'])) : VIDEOS;

  if (!items.length) {
    root.innerHTML = `<div class="empty-state">
      <p>Nothing here yet.</p>
      <p style="margin-top:var(--sp-3)">Message us on WhatsApp and we will send you recent work.</p>
    </div>`;
    return;
  }

  const grid = document.createElement('div');
  grid.className = 'gallery-masonry';
  items.forEach(v => grid.appendChild(videoCard(v, { base, onOpen: openViewer })));
  root.appendChild(grid);
}

