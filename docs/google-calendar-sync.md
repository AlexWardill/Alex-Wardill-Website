# Google Calendar gig sync (safe setup)

This repo uses a GitHub Action to update both **Upcoming Gigs** and **Previous Gigs** in `gigs.html` from your Google Calendar.

The updater edits only the area between:

- `<!-- upcoming-gigs:auto:start -->`
- `<!-- upcoming-gigs:auto:end -->`
- `<!-- previous-gigs:auto:start -->`
- `<!-- previous-gigs:auto:end -->`

Anything outside these markers is left untouched.

## Branch safety model

- `production`: protected live branch (GitHub Pages should deploy from this branch only)
- `automation/gigs-sync`: bot PR branch used by workflow

## Data mapping

From calendar **Gig**:

- Event title -> `.gig-venue`
- Event date -> `.gig-date`
- Event description (if non-empty) -> `data-ticket-link` for upcoming gigs

Date split behavior:

- Event date >= today (in `GIGS_TIME_ZONE`) -> **Upcoming Gigs**
- Event date < today (in `GIGS_TIME_ZONE`) -> **Previous Gigs**

## Required GitHub secrets

Set these in **Repository settings > Secrets and variables > Actions**:

- `GOOGLE_REFRESH_TOKEN` (required)
- `GOOGLE_OAUTH_CREDENTIALS_JSON` (or `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`)
- `GOOGLE_CALENDAR_ID` (recommended for stability)

Optional repository variables (**Settings > Secrets and variables > Actions > Variables**):

- `GOOGLE_CALENDAR_NAME` (default: `Gig`)
- `GIGS_TIME_ZONE` (default: `Europe/London`)
- `GIGS_DATE_LOCALE` (default: `en-GB`)

You do not need to upload your downloaded credentials JSON file into the repository. If needed, paste its JSON content into the `GOOGLE_OAUTH_CREDENTIALS_JSON` secret.

## One-time refresh token generation

You can generate your refresh token locally using the helper script:

1. Ensure Node.js is installed.
2. In Google Cloud OAuth client settings, add `http://127.0.0.1:53682/oauth2callback` as an authorized redirect URI.
3. Run:
	- `npm install`
	- `npm run auth:google:refresh-token -- --credentials "C:/path/to/your-client-secret.json"`
4. Open the printed URL and approve access.
5. Copy the printed refresh token into GitHub secret `GOOGLE_REFRESH_TOKEN`.

Optional: if you use GitHub CLI and are logged in, store it automatically:

- `npm run auth:google:refresh-token -- --credentials "C:/path/to/your-client-secret.json" --set-gh-secret --repo AlexWardill/Alex-Wardill-Website`

## Important security rules

- Never commit your Google credentials JSON file to git.
- Keep calendar scope read-only (`https://www.googleapis.com/auth/calendar.readonly`).
- Use branch protection on `production` and require PR review.

## One-time manual test

1. Trigger `Sync gigs from Google Calendar` workflow with **Run workflow** and keep `dry_run` enabled.
2. Review workflow logs to confirm parsed gigs and dates.
3. Run it again with `dry_run` disabled to generate/update the PR into `production`.
4. Review and merge the automation PR into `production`.

## If local dry-run is unstable

If running `npm run sync:gigs:dry-run` locally crashes your editor/session, prefer testing with **workflow_dispatch** in GitHub Actions.

- `dry_run: true` validates API access and parsing without changing files.
- `dry_run: false` opens/updates the automation PR into `production`.
- Only merge into `production` (or your live branch) after review.

## Notes

- Scheduled workflows run from the repository default branch workflow file.
- The workflow checks out and opens PRs against `production` as configured.
