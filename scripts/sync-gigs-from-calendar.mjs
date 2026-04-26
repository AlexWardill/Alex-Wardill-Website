import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { google } from 'googleapis';

const WEBSITE_ROOT = process.cwd();
const GIGS_HTML_PATH = path.join(WEBSITE_ROOT, 'gigs', 'index.html');
const UPCOMING_GIGS_START_MARKER = '<!-- upcoming-gigs:auto:start -->';
const UPCOMING_GIGS_END_MARKER = '<!-- upcoming-gigs:auto:end -->';
const PREVIOUS_GIGS_START_MARKER = '<!-- previous-gigs:auto:start -->';
const PREVIOUS_GIGS_END_MARKER = '<!-- previous-gigs:auto:end -->';
const LOCALE = process.env.GIGS_DATE_LOCALE ?? 'en-GB';
const EVENT_TIME_ZONE = process.env.GIGS_TIME_ZONE ?? 'Europe/London';

function getNormalizedSecret(name) {
  const value = process.env[name];
  if (typeof value !== 'string') {
    return '';
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }

  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }

  return trimmed;
}

function isTruthy(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (typeof value !== 'string') {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

const isDryRun = process.argv.includes('--dry-run') || isTruthy(process.env.DRY_RUN);

function ordinal(day) {
  if (day > 3 && day < 21) return 'th';
  switch (day % 10) {
    case 1:
      return 'st';
    case 2:
      return 'nd';
    case 3:
      return 'rd';
    default:
      return 'th';
  }
}

function formatGigDate(isoDate) {
  const date = new Date(`${isoDate}T00:00:00`);
  const day = date.getDate();
  const month = date.toLocaleString(LOCALE, { month: 'long', timeZone: EVENT_TIME_ZONE });
  const year = date.getFullYear();
  return `${day}${ordinal(day)} ${month} ${year}`;
}

function extractDate(event) {
  if (event.start?.date) {
    return event.start.date;
  }

  if (event.start?.dateTime) {
    return event.start.dateTime.slice(0, 10);
  }

  return null;
}

function extractTicketLink(text = '') {
  const value = text.trim();
  if (!value) {
    return '';
  }

  const hrefMatch = value.match(/href\s*=\s*["']([^"']+)["']/i);
  const urlMatch = value.match(/https?:\/\/[^\s<>'"]+/i);
  const candidate = hrefMatch?.[1]?.trim() ?? urlMatch?.[0]?.trim() ?? '';

  if (!candidate) {
    return '';
  }

  try {
    const parsed = new URL(candidate);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.toString();
    }
  } catch {
    return '';
  }

  return '';
}

function escapeHtml(text = '') {
  return text
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function getCredentialsFromEnv() {
  const clientId = getNormalizedSecret('GOOGLE_CLIENT_ID');
  const clientSecret = getNormalizedSecret('GOOGLE_CLIENT_SECRET');

  if (clientId && clientSecret) {
    return { clientId, clientSecret };
  }

  const raw = process.env.GOOGLE_OAUTH_CREDENTIALS_JSON;
  if (!raw) {
    throw new Error('Missing Google OAuth credentials. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET or GOOGLE_OAUTH_CREDENTIALS_JSON.');
  }

  const parsed = JSON.parse(raw);
  const creds = parsed.installed ?? parsed.web;
  if (!creds?.client_id || !creds?.client_secret) {
    throw new Error('Invalid GOOGLE_OAUTH_CREDENTIALS_JSON: expected installed/web.client_id and client_secret.');
  }

  return { clientId: creds.client_id, clientSecret: creds.client_secret };
}

async function resolveCalendarId(calendar) {
  const fromEnv = process.env.GOOGLE_CALENDAR_ID;
  if (fromEnv) {
    return fromEnv;
  }

  const calendarName = process.env.GOOGLE_CALENDAR_NAME ?? 'Gig';
  const listResponse = await calendar.calendarList.list();
  const entry = (listResponse.data.items ?? []).find((item) => item.summary?.toLowerCase() === calendarName.toLowerCase());

  if (!entry?.id) {
    throw new Error(`Calendar not found by name: ${calendarName}. Set GOOGLE_CALENDAR_ID to be explicit.`);
  }

  return entry.id;
}

function formatIsoDateInTimeZone(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  const day = parts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) {
    throw new Error('Failed to format date in configured time zone.');
  }

  return `${year}-${month}-${day}`;
}

function replaceBetweenMarkers(html, startMarker, endMarker, markup, indent) {
  if (!html.includes(startMarker) || !html.includes(endMarker)) {
    throw new Error(`Missing markers: '${startMarker}' and '${endMarker}'.`);
  }

  const markerPattern = new RegExp(
    `(${startMarker})([\\s\\S]*?)(${endMarker})`
  );

  return html.replace(markerPattern, `$1\n${markup}\n${indent}$3`);
}

async function listCalendarEvents(calendar, calendarId, timeMin, timeMax) {
  const events = [];
  let pageToken;

  do {
    const response = await calendar.events.list({
      calendarId,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime',
      maxResults: 2500,
      timeZone: EVENT_TIME_ZONE,
      pageToken,
    });

    events.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return events;
}

async function run() {
  const refreshToken = getNormalizedSecret('GOOGLE_REFRESH_TOKEN');
  if (!refreshToken) {
    throw new Error('Missing GOOGLE_REFRESH_TOKEN.');
  }

  const { clientId, clientSecret } = getCredentialsFromEnv();
  const authClient = new google.auth.OAuth2(clientId, clientSecret);
  authClient.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: 'v3', auth: authClient });
  const calendarId = await resolveCalendarId(calendar);

  const now = new Date();
  const todayIso = formatIsoDateInTimeZone(now, EVENT_TIME_ZONE);
  const rangeStart = new Date(now);
  rangeStart.setFullYear(rangeStart.getFullYear() - 5);
  const rangeEnd = new Date(now);
  rangeEnd.setFullYear(rangeEnd.getFullYear() + 5);

  const eventsResponse = await listCalendarEvents(
    calendar,
    calendarId,
    rangeStart.toISOString(),
    rangeEnd.toISOString()
  );

  const events = eventsResponse
    .map((event) => {
      if (event.status === 'cancelled') {
        return null;
      }

      const isoDate = extractDate(event);
      const summary = event.summary?.trim();
      if (!isoDate || !summary) {
        return null;
      }

      return {
        isoDate,
        venue: summary,
        gigDate: formatGigDate(isoDate),
        ticketLink: extractTicketLink(event.description ?? ''),
      };
    })
    .filter(Boolean);

  const upcomingEvents = events
    .filter((event) => event.isoDate >= todayIso)
    .sort((left, right) => left.isoDate.localeCompare(right.isoDate));

  const previousEvents = events
    .filter((event) => event.isoDate < todayIso)
    .sort((left, right) => right.isoDate.localeCompare(left.isoDate));

  if (isDryRun) {
    console.log(`Dry run: found ${events.length} gigs in calendar '${calendarId}'.`);
    console.log(`- Upcoming gigs: ${upcomingEvents.length}`);
    console.log(`- Previous gigs: ${previousEvents.length}`);
    upcomingEvents.forEach((event, index) => {
      console.log(`UPCOMING ${index + 1}. ${event.gigDate} | ${event.venue} | ${event.ticketLink || 'no ticket link'}`);
    });
    previousEvents.forEach((event, index) => {
      console.log(`PREVIOUS ${index + 1}. ${event.gigDate} | ${event.venue}`);
    });
    return;
  }

  const upcomingMarkup = upcomingEvents.length
    ? upcomingEvents
        .map(
          (event) => `                <div class="gig-item upcoming-gig"${event.ticketLink ? ` data-ticket-link="${escapeHtml(event.ticketLink)}"` : ''}>\n                    <div class="gig-venue">${escapeHtml(event.venue)}</div>\n                    <div class="gig-date">${escapeHtml(event.gigDate)}</div>\n                </div>`
        )
        .join('\n')
    : `                <div class="gig-item upcoming-gig">\n                    <div class="gig-venue">No upcoming gigs currently listed</div>\n                    <div class="gig-date"></div>\n                </div>`;

  const previousMarkup = previousEvents.length
    ? previousEvents
        .map(
          (event) => `                <div class="gig-item gig-item-simple">\n                    <div class="gig-venue">${escapeHtml(event.venue)}</div>\n                    <div class="gig-date">${escapeHtml(event.gigDate)}</div>\n                </div>`
        )
        .join('\n')
    : `                <div class="gig-item gig-item-simple">\n                    <div class="gig-venue">No previous gigs currently listed</div>\n                    <div class="gig-date"></div>\n                </div>`;

  const html = await fs.readFile(GIGS_HTML_PATH, 'utf8');

  const updatedUpcoming = replaceBetweenMarkers(
    html,
    UPCOMING_GIGS_START_MARKER,
    UPCOMING_GIGS_END_MARKER,
    upcomingMarkup,
    '                '
  );

  const updated = replaceBetweenMarkers(
    updatedUpcoming,
    PREVIOUS_GIGS_START_MARKER,
    PREVIOUS_GIGS_END_MARKER,
    previousMarkup,
    '                '
  );

  await fs.writeFile(GIGS_HTML_PATH, updated, 'utf8');

  console.log(`Synced gigs from calendar '${calendarId}'. Upcoming: ${upcomingEvents.length}, Previous: ${previousEvents.length}.`);
}

run().catch((error) => {
  const oauthError = error?.response?.data?.error;
  const oauthDescription = error?.response?.data?.error_description;

  if (oauthError === 'invalid_grant') {
    console.error('Google rejected GOOGLE_REFRESH_TOKEN: token is expired, revoked, malformed, or tied to different OAuth client credentials.');
    if (oauthDescription) {
      console.error(`Details: ${oauthDescription}`);
    }
    console.error('Fix: generate a new token with `npm run auth:google:refresh-token -- --credentials "<path-to-client-secret.json>"` and update GitHub secret GOOGLE_REFRESH_TOKEN.');
  } else if (oauthError === 'invalid_client') {
    console.error('Google rejected OAuth client credentials. Verify GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET (or GOOGLE_OAUTH_CREDENTIALS_JSON) match the client used to mint the refresh token.');
    if (oauthDescription) {
      console.error(`Details: ${oauthDescription}`);
    }
  } else {
    console.error(error);
  }

  process.exit(1);
});
