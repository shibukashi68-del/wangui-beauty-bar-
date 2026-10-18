// Pure domain logic for scheduling. No I/O, no framework — fully unit-testable.
// Timezone rules: the salon operates on Africa/Nairobi time regardless of where
// the server or the client is. All times are minutes-since-midnight integers.

import { CONFIG } from '../css/config.js';
import { SERVICES } from '../css/services.js';

const NAIROBI_TZ = 'Africa/Nairobi';
const MIN_SERVICE_MINUTES = 30;
const VALID_STATUSES = ['pending', 'confirmed', 'declined', 'completed'];

export const servicesById = new Map(SERVICES.map((service) => [service.id, service]));

export function minutes(value) {
  const match = String(value).match(/^(\d{1,2}):(\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
}

export function todayNairobi(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: NAIROBI_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const part = (name) => parts.find((item) => item.type === name)?.value || '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function timeNowNairobi(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: NAIROBI_TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (name) => parts.find((item) => item.type === name)?.value || '';
  return `${part('hour')}:${part('minute')}`;
}

/** [openMinute, closeMinute] for the date in Nairobi time, or null if closed. */
export function businessWindow(date) {
  const day = new Intl.DateTimeFormat('en-US', { timeZone: NAIROBI_TZ, weekday: 'short' })
    .format(new Date(`${date}T12:00:00Z`));
  const schedule = CONFIG.businessHours.find((item) => item.day.toLowerCase() === day.toLowerCase());
  const matches = schedule?.hours.match(/(\d{1,2}:\d{2})\s*[–-]\s*(\d{1,2}:\d{2})/);
  return matches ? [minutes(matches[1]), minutes(matches[2])] : null;
}

export function serviceDurationMinutes(service) {
  return Math.max(MIN_SERVICE_MINUTES, Number.parseInt(service.duration, 10) || MIN_SERVICE_MINUTES);
}

/**
 * Validates a booking request. Returns an error string, or an object of
 * sanitised details ready for persistence.
 * `now` is injectable for tests.
 */
export function validateBooking(input, now = new Date()) {
  if (!input || typeof input !== 'object') return 'Enter your booking details.';
  const name = typeof input.name === 'string' ? input.name.trim() : '';
  const phone = typeof input.phone === 'string' ? input.phone.trim() : '';
  const notes = typeof input.notes === 'string' ? input.notes.trim() : '';
  const service = servicesById.get(input.serviceId);
  const date = typeof input.date === 'string' ? input.date : '';
  const time = typeof input.time === 'string' ? input.time : '';

  if (name.length < 2 || name.length > 100) return 'Enter a name between 2 and 100 characters.';
  const phoneDigits = phone.replace(/\D/g, '');
  if (!/^[+\d][\d\s()+-]{6,24}$/.test(phone) || phoneDigits.length < 7 || phoneDigits.length > 15) {
    return 'Enter a valid phone number.';
  }
  if (!service) return 'Choose a valid service.';

  const parsedDate = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)
    || !Number.isFinite(parsedDate.getTime())
    || parsedDate.toISOString().slice(0, 10) !== date
    || date < todayNairobi(now)) {
    return 'Choose a valid date from today onward.';
  }

  const start = minutes(time);
  if (!Number.isFinite(start) || start >= 24 * 60) return 'Choose a valid time.';

  if (date === todayNairobi(now)) {
    if (start <= minutes(timeNowNairobi(now))) return 'Choose a time that has not passed.';
  }

  if (notes.length > 1000) return 'Notes must be 1,000 characters or fewer.';

  const window = businessWindow(date);
  if (!window) return 'The salon is closed on that day. Please choose another date.';

  const duration = serviceDurationMinutes(service);
  if (start < window[0] || start + duration > window[1]) {
    return 'That time is outside the salon opening hours for this service.';
  }

  return { name, phone, notes, service, date, time, start, end: start + duration };
}

export function isValidStatus(status) {
  return VALID_STATUSES.includes(status);
}

/** Rows overlap on the same day when each starts before the other ends. */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}
