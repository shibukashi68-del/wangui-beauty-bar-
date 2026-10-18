import { VIDEO_DIR, Video } from './videos.js';

export interface VideoCardOptions {
  /** Optional path prefix (kept for API compatibility; normally unused). */
  base?: string;
  /** Called when the tile is activated, to open a full-size viewer. */
  onOpen?: (video: Video) => void;
}

/**
 * A gallery tile for one video.
 *
 * Behaviour:
 *  - The first frame is shown as the poster, so the tile is never blank.
 *  - Hovering (or focusing) plays a muted preview; leaving pauses and rewinds.
 *  - Clicking opens the full viewer via `onOpen`.
 *  - If the file is missing, the tile is marked unavailable instead of
 *    silently disappearing — a typo should be visible, not invisible.
 */
export function videoCard(video: Video, { base = '', onOpen }: VideoCardOptions = {}): HTMLElement {
  const wrap = document.createElement('article');
  wrap.className = 'video-card';
  wrap.tabIndex = 0;
  wrap.setAttribute('role', 'button');
  wrap.setAttribute('aria-label', `Play ${video.caption || video.file}`);

  const vid = document.createElement('video');
  // VIDEO_DIR already ends in '/', and callers pass '' for base, so this is a
  // single clean join. `base` is honoured for backwards compatibility only.
  vid.src = `${base}${VIDEO_DIR}${encodeURI(video.file)}`;
  vid.muted = true;
  vid.loop = true;
  vid.playsInline = true;
  vid.preload = 'metadata';
  vid.setAttribute('playsinline', '');
  vid.setAttribute('aria-hidden', 'true');

  // Reveal the poster frame as soon as dimensions are known, and keep the
  // player paused on the first frame so it reads as a still image.
  vid.addEventListener('loadedmetadata', () => {
    wrap.classList.add('is-ready');
    try {
      vid.currentTime = 0.1;
    } catch {
      /* seeking before data is ready is harmless */
    }
  });

  // A genuinely broken/missing file: mark it, do not hide it.
  vid.addEventListener('error', () => {
    wrap.classList.add('is-unavailable');
  });

  const play = () => {
    if (wrap.classList.contains('is-unavailable')) return;
    void vid.play().catch(() => {});
  };
  const stop = () => {
    vid.pause();
    try {
      vid.currentTime = 0.1;
    } catch {
      /* ignore */
    }
  };

  wrap.addEventListener('mouseenter', play);
  wrap.addEventListener('mouseleave', stop);
  wrap.addEventListener('focus', play);
  wrap.addEventListener('blur', stop);
  wrap.addEventListener('click', () => onOpen?.(video));
  wrap.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpen?.(video);
    }
  });

  // Play badge overlay.
  const badge = document.createElement('span');
  badge.className = 'video-card__play';
  badge.setAttribute('aria-hidden', 'true');

  wrap.appendChild(vid);
  wrap.appendChild(badge);

  if (video.caption) {
    const label = document.createElement('div');
    label.className = 'video-card__label';
    label.textContent = video.caption;
    wrap.appendChild(label);
  }

  return wrap;
}