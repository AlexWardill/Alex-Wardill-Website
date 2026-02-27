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

You do not need to upload your downloaded credentials JSON file into the repository. If needed, paste its JSON content into the `GOOGLE_OAUTH_CREDENTIALS_JSON` secret.

## Important security rules

- Never commit your Google credentials JSON file to git.
- Keep calendar scope read-only (`https://www.googleapis.com/auth/calendar.readonly`).
- Use branch protection on `production` and require PR review.

## One-time manual test

1. Trigger `Sync gigs from Google Calendar` workflow with **Run workflow** and keep `dry_run` enabled.
2. Review workflow logs to confirm parsed gigs and dates.
3. Run it again with `dry_run` disabled to generate/update the PR into `develop`.
4. Open PR from `develop` -> `production` and merge after review.

## Notes

- Scheduled workflows run from the repository default branch workflow file.
- If your default branch is not `develop`, the schedule will still run and checkout `develop` as configured.
