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

export function formatGigDate(dateString, { includeYear = true } = {}) {
  const date = parseIsoDate(dateString);

  if (!date) {
    return '';
  }

  const day = date.getDate();
  const month = new Intl.DateTimeFormat('en-GB', { month: 'short' }).format(date);
  const suffix = ['th', 'st', 'nd', 'rd'][(day % 100 > 20 ? day % 10 : day % 20)] || 'th';
  const year = includeYear ? ` ${date.getFullYear()}` : '';

  return `${day}${suffix} ${month}${year}`;
}
