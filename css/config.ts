// ─── EDIT THIS FILE ONLY ──────────────────────────────────────────
// Fill in ONLY details you can verify from the client (business card,
// Instagram bio, WhatsApp message, etc.). Leave blank if unsure —
// the UI will hide the feature rather than invent data.

export interface BusinessHours {
  day: string;
  hours: string;
}

export interface SalonConfig {
  salonName: string;
  tagline: string;
  whatsappNumber: string; // e.g. '254712345678' (no +, no spaces)
  phoneDisplay: string;   // e.g. '+254 712 345 678'
  email: string;
  address: string;
  instagram: string;
  businessHours: BusinessHours[];
  currency: string;
  bookingFeeEnabled: boolean; // leave false — no server, no M-Pesa
  /** Filename inside /video used as the opening hero film. '' hides the hero. */
  heroVideo: string;
  /** Short line shown over the hero video. */
  heroHeadline: string;
}

export const CONFIG: SalonConfig = {
  salonName: 'Wangui Beauty Bar',
  tagline: 'Beauty care with a polished, personal finish.',
  whatsappNumber: '254727026545', // e.g. '254712345678' (no +, no spaces)
  phoneDisplay: '+254 727 026 545', // e.g. '+254 712 345 678'
  email: '',
  address: 'Umoja 2, opposite Naivas Supermarket, Nairobi',
  instagram: '',
  businessHours: [
    { day: 'Mon', hours: '9:00 – 18:00' },
    { day: 'Tue', hours: '9:00 – 18:00' },
    { day: 'Wed', hours: '9:00 – 18:00' },
    { day: 'Thu', hours: '9:00 – 18:00' },
    { day: 'Fri', hours: '9:00 – 18:00' },
    { day: 'Sat', hours: '9:00 – 17:00' },
    { day: 'Sun', hours: 'Closed' },
  ],
  currency: 'KES',
  bookingFeeEnabled: false,  // leave false — no server, no M-Pesa
  // The opening advertising film. Change this one line to swap it.
  heroVideo: 'hero.mp4',
  heroHeadline: 'Beautiful hair, polished looks, and a studio experience you can trust.',
};

export function isConfigured(): boolean {
  return Boolean(CONFIG.whatsappNumber);
}
