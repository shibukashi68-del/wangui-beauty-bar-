// Add services ONLY when verified by the client.
// Each item: { id, name, description, price, duration, dept }
// dept must be one of: 'wigs-hair' | 'makeup' | 'nails' | 'brows-lashes'

export type Department = 'wigs-hair' | 'makeup' | 'nails' | 'brows-lashes';

export interface Service {
  id: string;
  name: string;
  description: string;
  price: number;
  duration: string;
  dept: Department;
}

export interface DepartmentInfo {
  title: string;
  slug: string;
  blurb: string;
}

export const SERVICES: Service[] = [
  // Wigs & Hair
  { id: 'wig-install', name: 'Wig Installation', description: 'Professional wig installation and styling', price: 1000, duration: '90 min', dept: 'wigs-hair' },
  { id: 'frontal-install', name: 'Frontal Installation', description: 'Lace frontal sew-in or glue-less install', price: 1500, duration: '120 min', dept: 'wigs-hair' },
  { id: 'hair-styling', name: 'Hair Styling', description: 'Blowout, flat iron, or curl styling', price: 800, duration: '60 min', dept: 'wigs-hair' },
  { id: 'hair-treatment', name: 'Hair Treatment', description: 'Deep conditioning and repair treatment', price: 1200, duration: '60 min', dept: 'wigs-hair' },
  { id: 'wig-purchase', name: 'Wig Purchase', description: 'Ready-made wigs available from KES 7,000', price: 7000, duration: '—', dept: 'wigs-hair' },

  // Makeup
  { id: 'natural-makeup', name: 'Natural Makeup', description: 'Everyday natural look', price: 800, duration: '60 min', dept: 'makeup' },
  { id: 'glam-makeup', name: 'Glam Makeup', description: 'Full glam for events and occasions', price: 2000, duration: '90 min', dept: 'makeup' },
  { id: 'bridal-makeup', name: 'Bridal Makeup', description: 'Wedding day makeup with trial', price: 3500, duration: '120 min', dept: 'makeup' },

  // Nails
  { id: 'manicure', name: 'Manicure', description: 'Classic manicure with polish', price: 700, duration: '45 min', dept: 'nails' },
  { id: 'pedicure', name: 'Pedicure', description: 'Relaxing pedicure with polish', price: 1000, duration: '45 min', dept: 'nails' },
  { id: 'gel-nails', name: 'Gel Nails', description: 'Gel overlay or extension', price: 1500, duration: '90 min', dept: 'nails' },

  // Brows & Lashes
  { id: 'brow-shaping', name: 'Brow Shaping', description: 'Threading or waxing brow shape', price: 500, duration: '30 min', dept: 'brows-lashes' },
  { id: 'lash-extension', name: 'Lash Extensions', description: 'Classic or volume lash extensions', price: 2000, duration: '90 min', dept: 'brows-lashes' },
  { id: 'brow-tint', name: 'Brow Tint', description: 'Semi-permanent brow tinting', price: 700, duration: '30 min', dept: 'brows-lashes' },
];

export const DEPARTMENTS: Record<Department, DepartmentInfo> = {
  'wigs-hair':   { title:'Wigs & Hair',      slug:'wigs-hair',     blurb:'Installations, frontals, styling and ready-made wigs.' },
  'makeup':      { title:'Makeup',           slug:'makeup',        blurb:'Natural, glam and bridal looks for any occasion.' },
  'nails':       { title:'Nails',            slug:'nails',         blurb:'Manicures, pedicures and gel extensions.' },
  'brows-lashes':{ title:'Brows & Lashes',   slug:'brows-lashes',  blurb:'Shaping, tinting and lash extensions.' },
};

export function servicesByDept(dept: Department): Service[] {
  return SERVICES.filter(s => s.dept === dept);
}