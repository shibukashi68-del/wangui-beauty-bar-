import { CONFIG } from './config.js';

export interface BookingDetails {
  name: string;
  phone: string;
  service: string;
  date: string;
  time: string;
  notes: string;
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
