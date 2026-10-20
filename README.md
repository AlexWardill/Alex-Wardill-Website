# Alex Wardill Website
Personal website source files.

## Pages CMS testing branch

This repository is intentionally being developed on the `feature/pages-cms-gigs-gallery` branch so the CMS work stays separate from `production`.

### Local development and testing

1. Run `npm install`
2. Run `npm run build:cms`
3. Run `npm run test:cms`
4. Start a local preview with `python -m http.server 8000`
5. Open `http://localhost:8000/gigs/` to review the sorted upcoming/past gigs

### Pages CMS setup

- Add the repository to Pages CMS and select this branch.
- Use the provided `.pages.yml` config.
- CMS-managed gigs live in `content/gigs/` as Markdown files.
- Uploaded gallery images should be placed in `images/gallery-uploaded/` and are available to gallery pages via the generated CMS data.

### Safe workflow

- Keep CMS edits on the feature branch until reviewed.
- Avoid committing to `production` while testing the Pages CMS flow.
- Rebuild content with `npm run build:cms` after content changes.
