# Alex Wardill Website

Static portfolio site with Pages CMS content editing.

## Build and test

1. Install dependencies with `npm ci`.
2. Run `npm test`.
3. Run `npm run build` to resize new gallery uploads, sort the CMS data, and regenerate the pages and `image_data.json`.
4. Preview locally with `python -m http.server 8000`.

## Pages CMS

- Add the repository to Pages CMS and select the `develop` branch while testing.
- Gallery images are managed as one draggable list in `content/gallery-images.json`. The current grouped `image_data.json` format remains the website-facing output.
- Select Portraits, Gigs, Siena, or Other per image. For Gigs, choose the year (2025 or 2026) to preserve the site's existing year-specific pages.
- Upload JPG, JPEG, PNG, WebP, or iPhone HEIC/HEIF images through Gallery uploads. Originals are stored in `_uploads/gallery/`; the build creates resized versions (maximum 2560 pixels) in `images/optimized/gallery/`, with WebP plus a same-format fallback where needed.
- Upcoming gigs and Past gigs are separate editable lists in `content/gigs-upcoming.json` and `content/gigs-past.json`. The build moves entries across the date boundary and sorts each list using `Europe/London`.

## GitHub Actions and publishing

The Build CMS content workflow runs on pushes to `develop` and `production`, and its scheduled run targets `develop`. It commits generated content when needed. Commits made with the Actions token do not start another workflow run. A push to `production` builds and deploys the static site to GitHub Pages; Jekyll excludes the `_uploads/` directory from the published site. While testing, keep the workflow on `develop` and do not change the live Pages source or merge it to `production`.

For `develop` testing:

1. Allow Actions to read and write repository contents. The repository is currently configured with write access.
2. Add the repository to Pages CMS and grant it access to the `develop` branch.
3. Push changes to `develop` or manually run **Build CMS content** from the Actions tab with `develop` selected. The workflow validates, builds, and commits generated changes on `develop`; it does not deploy Pages from that branch.

GitHub only runs scheduled workflows from the repository's default branch. The daily gig check will therefore not become active until the workflow reaches the default branch. Do not merge it to `production` or change the live Pages source until production promotion is authorized.

Gig listings are fully managed in Pages CMS; no external credentials are needed.
