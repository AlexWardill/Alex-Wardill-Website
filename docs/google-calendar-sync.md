# Google Calendar gig sync (safe setup)

This repo uses a GitHub Action to update the **Upcoming Gigs** block in `gigs.html` from your Google Calendar.

## Branch safety model

- `production`: protected live branch (GitHub Pages should deploy from this branch only)
- `develop`: integration branch
- `feature/google-calendar-sync`: implementation branch
- `automation/gigs-sync`: bot PR branch used by workflow

## Data mapping

From calendar **Gig**:

- Event title -> `.gig-venue`
- Event date -> `.gig-date`
- First URL in event description -> `data-ticket-link`

## Required GitHub secrets

Set these in **Repository settings > Secrets and variables > Actions**:

- `GOOGLE_REFRESH_TOKEN` (required)
- `GOOGLE_OAUTH_CREDENTIALS_JSON` (or `GOOGLE_CLIENT_ID` + `GOOGLE_CLIENT_SECRET`)
- `GOOGLE_CALENDAR_ID` (recommended for stability)

## Important security rules

- Never commit your Google credentials JSON file to git.
- Keep calendar scope read-only (`https://www.googleapis.com/auth/calendar.readonly`).
- Use branch protection on `production` and require PR review.

## One-time manual test

1. Trigger `Sync gigs from Google Calendar` workflow with **Run workflow**.
2. Review generated PR into `develop`.
3. Merge to `develop` if correct.
4. Open PR from `develop` -> `production` and merge after review.

## Notes

- Scheduled workflows run from the repository default branch workflow file.
- If your default branch is not `develop`, the schedule will still run and checkout `develop` as configured.
