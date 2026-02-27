import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { google } from 'googleapis';

const WEBSITE_ROOT = process.cwd();
const GIGS_HTML_PATH = path.join(WEBSITE_ROOT, 'gigs.html');

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
  const month = date.toLocaleString('en-GB', { month: 'long' });
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

function extractFirstUrl(text = '') {
  const match = text.match(/https?:\/\/[^\s)]+/i);
  return match ? match[0] : '';
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
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

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
  const entry = (listResponse.data.items ?? []).find((item) => item.summary === calendarName);

  if (!entry?.id) {
    throw new Error(`Calendar not found by name: ${calendarName}. Set GOOGLE_CALENDAR_ID to be explicit.`);
  }

  return entry.id;
}

async function run() {
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error('Missing GOOGLE_REFRESH_TOKEN.');
  }

  const { clientId, clientSecret } = getCredentialsFromEnv();
  const authClient = new google.auth.OAuth2(clientId, clientSecret);
  authClient.setCredentials({ refresh_token: refreshToken });

  const calendar = google.calendar({ version: 'v3', auth: authClient });
  const calendarId = await resolveCalendarId(calendar);

  const eventsResponse = await calendar.events.list({
    calendarId,
    timeMin: new Date().toISOString(),
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 20,
  });

  const events = (eventsResponse.data.items ?? [])
    .map((event) => {
      const isoDate = extractDate(event);
      if (!isoDate || !event.summary) {
        return null;
      }

      return {
        venue: event.summary.trim(),
        gigDate: formatGigDate(isoDate),
        ticketLink: extractFirstUrl(event.description ?? ''),
      };
    })
    .filter(Boolean);

  const upcomingMarkup = events.length
    ? events
        .map(
          (event) => `                <div class="gig-item upcoming-gig" data-ticket-link="${escapeHtml(event.ticketLink)}">\n                    <div class="gig-venue">${escapeHtml(event.venue)}</div>\n                    <div class="gig-date">${escapeHtml(event.gigDate)}</div>\n                </div>`
        )
        .join('\n')
    : `                <div class="gig-item upcoming-gig" data-ticket-link="">\n                    <div class="gig-venue">No upcoming gigs currently listed</div>\n                    <div class="gig-date"></div>\n                </div>`;

  const html = await fs.readFile(GIGS_HTML_PATH, 'utf8');

  const pattern = /(<h1 class="gigs-title">Upcoming Gigs<\/h1>\s*<div class="gigs-list">)([\s\S]*?)(\s*<\/div>\s*<\/div>\s*<\/section>)/;
  if (!pattern.test(html)) {
    throw new Error('Could not find Upcoming Gigs block in gigs.html.');
  }

  const updated = html.replace(pattern, `$1\n${upcomingMarkup}$3`);
  await fs.writeFile(GIGS_HTML_PATH, updated, 'utf8');

  console.log(`Synced ${events.length} upcoming gigs from calendar '${calendarId}'.`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
