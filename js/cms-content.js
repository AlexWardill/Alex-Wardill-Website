export function parseIsoDate(dateString) {
  if (!dateString) {
    return null;
  }

  const trimmedDate = String(dateString).trim();
  const date = new Date(`${trimmedDate}T00:00:00`);

  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
}

export function sortGigEntries(gigs = []) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  const entries = gigs
    .map((gig) => {
      const date = parseIsoDate(gig?.date);

      if (!date) {
        return null;
      }

      return {
        ...gig,
        _date: date,
      };
    })
    .filter(Boolean);

  const upcoming = entries
    .filter((gig) => gig._date >= startOfToday)
    .sort((left, right) => left._date - right._date);

  const past = entries
    .filter((gig) => gig._date < startOfToday)
    .sort((left, right) => right._date - left._date);

  return { upcoming, past };
}

export function getUpcomingGigEntries(gigs = [], limit = Infinity) {
  const { upcoming } = sortGigEntries(gigs);

  if (!Number.isFinite(limit)) {
    return upcoming;
  }

  return upcoming.slice(0, limit);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const GIG_ITEM_CLASSES = {
  upcoming: 'gig-item upcoming-gig',
  previous: 'gig-item gig-item-simple',
  home: 'home-gig-item',
};

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function formatGigDate(dateString, { includeYear = true } = {}) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString ?? '').trim());

  if (!match) {
    return '';
  }

  const year = includeYear ? ` ${match[1]}` : '';
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1]}${year}`;
}

export function renderGigHtml(gig, variant) {
  const isPrevious = variant === 'previous';
  const place = [gig.venue, gig.city].filter(Boolean).join(', ');
  const where = isPrevious ? place : [place, gig.time].filter(Boolean).join(' · ');
  const details = [
    `<div class="gig-band">${escapeHtml(gig.band)}</div>`,
    gig.event ? `<div class="gig-event">${escapeHtml(gig.event)}</div>` : '',
    where ? `<div class="gig-venue">${escapeHtml(where)}</div>` : '',
  ].join('');
  const date = escapeHtml(formatGigDate(gig.date, { includeYear: isPrevious }));
  const body = `<div class="gig-main">${details}</div><div class="gig-date">${date}</div>`;
  const classes = GIG_ITEM_CLASSES[variant];
  const ticketLink = /^https?:\/\//i.test(gig.ticketLink ?? '') ? gig.ticketLink : '';

  if (ticketLink) {
    return `<a class="${classes} gig-item-clickable" href="${escapeHtml(ticketLink)}" target="_blank" rel="noopener noreferrer">${body}</a>`;
  }

  return `<div class="${classes}">${body}</div>`;
}

export function renderGigListHtml(gigs, variant) {
  if (!gigs.length) {
    return `<div class="${GIG_ITEM_CLASSES[variant]}"><div class="gig-main"><div class="gig-band">No gigs scheduled yet.</div></div><div class="gig-date">Check back soon</div></div>`;
  }

  return gigs.map((gig) => renderGigHtml(gig, variant)).join('\n');
}
