# Alex Wardill Website

Static portfolio website with Pages CMS content management.

## Local build and test

1. Install dependencies with `npm ci`.
2. Run `npm test`.
3. Run `npm run build` to optimize new uploads, sort gig lists, update the existing gallery pages, and generate the site's CMS data.
4. Start a preview with `python -m http.server 8000`, then open `http://localhost:8000/`.

## Pages CMS

- During testing, add the repository to Pages CMS and select the `develop` branch.
- Gallery images are managed in one draggable list at `content/gallery-images.json`; existing routes under `/gallery-portraits/`, `/gallery-gigs/`, `/gallery-siena/`, and `/gallery-other/` are retained.
- Upload JPG, JPEG, PNG, WebP, HEIC, or HEIF images through Gallery uploads. CMS originals are stored in `_uploads/gallery/` and excluded from publication; the build writes resized, public copies under `images/optimized/gallery/`.
- Image entries contain the gallery, alt text, and carousel description. Dragging controls order; the optional numeric order field is available for precise sorting.
- Upcoming gigs and Past gigs are separate editable lists at `content/gigs-upcoming.json` and `content/gigs-past.json`. Build-time sorting uses the `Europe/London` date boundary and the current Gigs page layout.

## GitHub Actions and production safety

The Build CMS content workflow validates and builds changes on `develop`; generated files are committed back to that branch. Its scheduled run targets `develop`. A production push is configured to deploy the site, but this work is not authorized for production yet. Do not merge these changes or change the live Pages settings until production promotion is explicitly approved.

For testing, authorize Pages CMS to access `develop` and push CMS edits there. Repository Actions already has write permission. GitHub only activates scheduled workflows when the workflow is present on the default branch, so the daily run will not activate until the workflow is promoted to that branch.

The existing production site uses directory routes (for example `/gigs/`); local previews use the same paths.
