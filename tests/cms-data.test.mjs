import test from 'node:test';
import assert from 'node:assert/strict';

const { sortGigEntries, getUpcomingGigEntries } = await import('../js/cms-content.js');

test('sortGigEntries keeps future gigs in ascending order and past gigs in descending order', () => {
  const today = new Date();
  const pastDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 4).toISOString().slice(0, 10);
  const nearFuture = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 2).toISOString().slice(0, 10);
  const laterFuture = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 8).toISOString().slice(0, 10);

  const gigs = [
    { date: laterFuture },
    { date: pastDate },
    { date: nearFuture },
  ];

  const sorted = sortGigEntries(gigs);

  assert.deepEqual(sorted.upcoming.map((gig) => gig.date), [nearFuture, laterFuture]);
  assert.deepEqual(sorted.past.map((gig) => gig.date), [pastDate]);
});

test('getUpcomingGigEntries filters past gigs for the home page', () => {
  const today = new Date();
  const pastDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5).toISOString().slice(0, 10);
  const futureDate = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 3).toISOString().slice(0, 10);

  const gigs = [
    { title: 'Past item', date: pastDate },
    { title: 'Future item', date: futureDate },
  ];

  const upcoming = getUpcomingGigEntries(gigs);

  assert.deepEqual(upcoming.map((gig) => gig.title), ['Future item']);
});
