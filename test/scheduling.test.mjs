// Unit tests for the pure scheduling logic. No database, no server, no I/O.
// Run: node --test test/scheduling.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateBooking, businessWindow, minutes, todayNairobi,
  timeNowNairobi, serviceDurationMinutes, overlaps, isValidStatus,
} from '../lib/scheduling.mjs';

// Fixed "now": 2026-10-14 10:00 Nairobi (Wednesday, a 9:00–18:00 business day).
const NOW = new Date('2026-10-14T07:00:00Z');
const TODAY = '2026-10-14';

function validInput(overrides = {}) {
  return {
    name: 'Test Customer',
    phone: '+254 727 026 545',
    serviceId: 'wig-install', // 90 min
    date: '2026-10-15',
    time: '10:00',
    notes: '',
    ...overrides,
  };
}

test('minutes parses HH:MM', () => {
  assert.equal(minutes('09:30'), 570);
  assert.equal(minutes('23:59'), 1439);
  assert.equal(minutes('9:00'), 540);
});

test('minutes parses HH:MM; hour-range policing lives in validateBooking', () => {
  assert.ok(Number.isNaN(minutes('9')));
  assert.ok(Number.isNaN(minutes('')));
  assert.ok(Number.isNaN(minutes('ab:cd')));
  // '25:00' parses numerically; validateBooking's start >= 24*60 check rejects it.
  assert.equal(minutes('25:00'), 1500);
});

test('todayNairobi returns ISO date in Nairobi', () => {
  assert.equal(todayNairobi(NOW), TODAY);
  // 22:00 Nairobi on Oct 14 is still Oct 14, not Oct 15.
  assert.equal(todayNairobi(new Date('2026-10-14T19:00:00Z')), TODAY);
});

test('timeNowNairobi returns HH:MM in Nairobi', () => {
  assert.equal(timeNowNairobi(NOW), '10:00');
});

test('businessWindow parses opening hours', () => {
  assert.deepEqual(businessWindow('2026-10-14'), [540, 1080]); // Wed 9–18
  assert.deepEqual(businessWindow('2026-10-17'), [540, 1020]); // Sat 9–17
});

test('businessWindow returns null on closed day (Sunday)', () => {
  assert.equal(businessWindow('2026-10-18'), null);
});

test('serviceDurationMinutes floors at 30 and parses strings', () => {
  assert.equal(serviceDurationMinutes({ duration: '90 min' }), 90);
  assert.equal(serviceDurationMinutes({ duration: '—' }), 30);
  assert.equal(serviceDurationMinutes({ duration: '120 min' }), 120);
});

test('overlaps detects interval intersection', () => {
  assert.equal(overlaps(540, 630, 600, 690), true);  // 9–10:30 vs 10–11:30
  assert.equal(overlaps(540, 630, 630, 720), false); // back-to-back is fine
  assert.equal(overlaps(540, 630, 540, 630), true);  // identical
});

test('isValidStatus accepts exactly the four workflow states', () => {
  assert.equal(isValidStatus('pending'), true);
  assert.equal(isValidStatus('confirmed'), true);
  assert.equal(isValidStatus('declined'), true);
  assert.equal(isValidStatus('completed'), true);
  assert.equal(isValidStatus('cancelled'), false);
  assert.equal(isValidStatus(''), false);
  assert.equal(isValidStatus(undefined), false);
});

test('validateBooking accepts a valid future booking', () => {
  const result = validateBooking(validInput(), NOW);
  assert.equal(typeof result, 'object');
  assert.equal(result.start, 600);
  assert.equal(result.end, 690);
  assert.equal(result.service.id, 'wig-install');
});

test('validateBooking rejects short names', () => {
  assert.equal(validateBooking(validInput({ name: 'A' }), NOW), 'Enter a name between 2 and 100 characters.');
});

test('validateBooking rejects malformed phone numbers', () => {
  assert.equal(validateBooking(validInput({ phone: 'abc' }), NOW), 'Enter a valid phone number.');
  assert.equal(validateBooking(validInput({ phone: '+12' }), NOW), 'Enter a valid phone number.');
});

test('validateBooking rejects unknown services', () => {
  assert.equal(validateBooking(validInput({ serviceId: 'nope' }), NOW), 'Choose a valid service.');
});

test('validateBooking rejects past dates', () => {
  assert.equal(validateBooking(validInput({ date: '2026-10-13' }), NOW), 'Choose a valid date from today onward.');
});

test('validateBooking rejects same-day times in the past', () => {
  assert.equal(validateBooking(validInput({ date: TODAY, time: '09:00' }), NOW), 'Choose a time that has not passed.');
});

test('validateBooking rejects invalid time strings', () => {
  assert.equal(validateBooking(validInput({ time: '25:00' }), NOW), 'Choose a valid time.');
  assert.equal(validateBooking(validInput({ time: 'noon' }), NOW), 'Choose a valid time.');
});

test('validateBooking rejects closed days', () => {
  assert.equal(
    validateBooking(validInput({ date: '2026-10-18' }), NOW),
    'The salon is closed on that day. Please choose another date.',
  );
});

test('validateBooking rejects times outside opening hours', () => {
  // 90-min service starting 17:30 ends 19:00 > 18:00 close.
  assert.equal(
    validateBooking(validInput({ date: '2026-10-15', time: '17:30' }), NOW),
    'That time is outside the salon opening hours for this service.',
  );
  // Starting before opening.
  assert.equal(
    validateBooking(validInput({ date: '2026-10-15', time: '08:00' }), NOW),
    'That time is outside the salon opening hours for this service.',
  );
});

test('validateBooking accepts a service that ends exactly at closing', () => {
  const result = validateBooking(validInput({ date: '2026-10-15', time: '16:30' }), NOW);
  assert.equal(typeof result, 'object');
  assert.equal(result.end, 1080);
});

test('validateBooking rejects long notes', () => {
  const result = validateBooking(validInput({ notes: 'x'.repeat(1001) }), NOW);
  assert.equal(result, 'Notes must be 1,000 characters or fewer.');
});

test('validateBooking sanitises whitespace in name and notes', () => {
  const result = validateBooking(validInput({ name: '  Jane Doe  ', notes: '  window seat  ' }), NOW);
  assert.equal(result.name, 'Jane Doe');
  assert.equal(result.notes, 'window seat');
});

test('validateBooking handles non-object input', () => {
  assert.equal(validateBooking(null), 'Enter your booking details.');
  assert.equal(validateBooking('nope'), 'Enter your booking details.');
});
