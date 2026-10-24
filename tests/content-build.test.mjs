import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {
  GALLERY_PAGES,
  optimizeGalleryImages,
  publicGalleryImagePath,
  sortGalleryEntries,
  splitAndSortGigs,
  todayInTimeZone,
} from '../scripts/build-content.mjs';
import { renderGigHtml } from '../js/cms-content.js';

test('gigs move across the London date boundary and sort in opposite directions', () => {
  const result = splitAndSortGigs(
    [
      { date: '2026-10-28', band: 'Later show' },
      { date: '2026-10-23', band: 'Missed show' },
      { date: '2026-10-24', band: 'Today show' },
    ],
    [
      { date: '2026-10-25', band: 'Corrected future show' },
      { date: '2026-10-20', band: 'Older show' },
    ],
    '2026-10-24',
  );

  assert.deepEqual(result.upcoming.map(({ band }) => band), ['Today show', 'Corrected future show', 'Later show']);
  assert.deepEqual(result.past.map(({ band }) => band), ['Missed show', 'Older show']);
});

test('gig dates must be valid calendar dates', () => {
  assert.throws(
    () => splitAndSortGigs([{ date: '2026-02-30', band: 'Invalid date' }], [], '2026-02-01'),
    /invalid date "2026-02-30"/i,
  );
});

test('optional gig and gallery fields may be left blank in the CMS', () => {
  const gigs = splitAndSortGigs([
    { date: '2026-10-25', band: 'Test show', event: null, venue: null, time: null, city: null, ticketLink: null },
  ], [], '2026-10-24');
  assert.deepEqual(gigs.upcoming[0], {
    date: '2026-10-25',
    band: 'Test show',
    event: '',
    venue: '',
    time: '',
    city: '',
    ticketLink: '',
  });

  assert.deepEqual(sortGalleryEntries([
    {
      image: 'images/Gallery/Other/test.jpg',
      description: '',
      gallery: 'other',
      alt: 'Test photo',
      order: null,
    },
  ]), [{
    image: '/images/Gallery/Other/test.jpg',
    description: '',
    gallery: 'other',
    alt: 'Test photo',
  }]);
});

test('gigs require a band name', () => {
  assert.throws(
    () => splitAndSortGigs([{ date: '2026-10-25', venue: 'No band' }], [], '2026-10-24'),
    /missing a band name/i,
  );
});

test('gig renderer shows time on upcoming gigs only and escapes text', () => {
  const gig = { date: '2026-10-25', band: 'A & B', event: 'Festival', venue: 'Club', time: '19:30', city: 'London', ticketLink: '' };
  const upcoming = renderGigHtml(gig, 'upcoming');
  const previous = renderGigHtml(gig, 'previous');
  assert.match(upcoming, /A &amp; B/);
  assert.match(upcoming, /Club, London · 19:30/);
  assert.doesNotMatch(previous, /19:30/);
  assert.match(previous, /2026/);
});

test('same-day cutoff uses the configured local timezone', () => {
  assert.equal(todayInTimeZone(new Date('2026-10-24T00:30:00Z'), 'Europe/London'), '2026-10-24');
});

test('gallery entries group by gallery and preserve file order unless an order is supplied', () => {
  const entries = sortGalleryEntries([
    { image: 'images/Gallery/Siena/a.jpg', description: 'A', gallery: 'siena', alt: 'A' },
    { image: 'images/Gallery/Portraits/b.jpg', description: 'B', gallery: 'portraits', alt: 'B' },
    { image: 'images/Gallery/Siena/b.jpg', description: 'B', gallery: 'siena', alt: 'B' },
    { image: 'images/Gallery/Siena/c.jpg', description: 'C', gallery: 'siena', alt: 'C', order: 1 },
  ]);

  assert.deepEqual(entries.map(({ image }) => image), [
    '/images/Gallery/Portraits/b.jpg',
    '/images/Gallery/Siena/a.jpg',
    '/images/Gallery/Siena/c.jpg',
    '/images/Gallery/Siena/b.jpg',
  ]);
});

test('gallery entries reject paths outside the site image folder', () => {
  assert.throws(
    () => sortGalleryEntries([
      { image: '../private.jpg', description: 'A', gallery: 'other', alt: 'A' },
    ]),
    /must use a local path under images/i,
  );
});

test('galleries use the current production routes and keep Gigs in one list', () => {
  assert.deepEqual(GALLERY_PAGES, {
    portraits: 'gallery-portraits/index.html',
    gigs: 'gallery-gigs/index.html',
    siena: 'gallery-siena/index.html',
    other: 'gallery-other/index.html',
  });

  const entries = sortGalleryEntries([
    { image: 'images/Gallery/Gigs/later.jpg', description: 'Later', gallery: 'gigs', alt: 'Later' },
    { image: 'images/Gallery/Gigs/earlier.jpg', description: 'Earlier', gallery: 'gigs', alt: 'Earlier' },
  ]);
  assert.deepEqual(entries.map(({ image }) => image), [
    '/images/Gallery/Gigs/later.jpg',
    '/images/Gallery/Gigs/earlier.jpg',
  ]);
});

test('HEIC uploads render through a JPEG fallback', () => {
  assert.equal(
    publicGalleryImagePath('/images/optimized/gallery/phone-photo.heic'),
    '/images/optimized/gallery/phone-photo.jpg',
  );
});

test('image optimization resizes new or changed uploads only', async () => {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'gallery-image-build-'));
  const sourceRoot = path.join(tempRoot, 'originals');
  const outputRoot = path.join(tempRoot, 'optimized');
  const manifestPath = path.join(tempRoot, 'manifest.json');
  const sourcePath = path.join(sourceRoot, 'test-photo.jpg');

  try {
    await fs.mkdir(sourceRoot, { recursive: true });
    await sharp({
      create: { width: 3000, height: 1000, channels: 3, background: '#773333' },
    }).jpeg().toFile(sourcePath);

    const firstRun = await optimizeGalleryImages({ sourceRoot, outputRoot, manifestPath });
    assert.deepEqual(firstRun, { processedCount: 1, unchangedCount: 0 });
    assert.equal((await sharp(path.join(outputRoot, 'test-photo.jpg')).metadata()).width, 2560);
    await fs.access(path.join(outputRoot, 'test-photo.webp'));

    const unchangedRun = await optimizeGalleryImages({ sourceRoot, outputRoot, manifestPath });
    assert.deepEqual(unchangedRun, { processedCount: 0, unchangedCount: 1 });

    await sharp({
      create: { width: 1000, height: 3000, channels: 3, background: '#337777' },
    }).jpeg().toFile(sourcePath);
    const changedRun = await optimizeGalleryImages({ sourceRoot, outputRoot, manifestPath });
    assert.deepEqual(changedRun, { processedCount: 1, unchangedCount: 0 });
    assert.equal((await sharp(path.join(outputRoot, 'test-photo.jpg')).metadata()).height, 2560);
  } finally {
    await fs.rm(tempRoot, { recursive: true, force: true });
  }
});
