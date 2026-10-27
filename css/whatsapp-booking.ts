import { CONFIG } from './config.js';

export interface BookingDetails {
  name: string;
  phone: string;
  service: string;
  date: string;
  time: string;
  notes: string;
}

export interface StyleBookingDetails {
  service: string;
  category: string;
  style: string;
  reference?: string;
  priceKes: number | null;
  name: string;
  date: string;
  time: string;
  request: string;
}

/** Builds a message the customer can choose to send after saving a request. */
export function buildBookingMessage({ name, phone, service, date, time, notes }: BookingDetails): string {
  return [
    '*NEW BOOKING REQUEST*', '',
    `Service: ${service}`,
    `Date: ${date}`,
    `Time: ${time}`,
    `Client: ${name}`,
    `Phone: ${phone}`,
    notes ? `Notes: ${notes}` : '',
    '', `— sent from ${CONFIG.salonName} website`,
  ].filter(Boolean).join('\n');
}

/** Builds a direct WhatsApp request for a selected service or gallery style. */
export function buildStyleBookingMessage(details: StyleBookingDetails): string {
  const price = details.priceKes === null
    ? 'Price confirmation required'
    : `KES ${new Intl.NumberFormat('en-KE').format(details.priceKes)}`;

  return [
    `*${CONFIG.salonName} — BOOKING REQUEST*`,
    '',
    `Service: ${details.service}`,
    `Category: ${details.category}`,
    `Selected style: ${details.style}`,
    details.reference ? `Gallery video reference: ${details.reference}` : '',
    `Price: ${price}`,
    `Name: ${details.name}`,
    `Preferred appointment: ${details.date} at ${details.time}`,
    details.request ? `Request: ${details.request}` : '',
    '',
    'Please confirm availability and the appointment with me on WhatsApp. This request is not yet confirmed.',
  ].filter(Boolean).join('\n');
}
