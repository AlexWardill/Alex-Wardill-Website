import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import convertHeic from 'heic-convert';

const rootDir = process.cwd();
const timeZone = process.env.GIGS_TIME_ZONE || 'Europe/London';
const gallerySourcePath = path.join(rootDir, 'content', 'gallery-images.json');
const imageDataPath = path.join(rootDir, 'image_data.json');
const upcomingGigsPath = path.join(rootDir, 'content', 'gigs-upcoming.json');
const pastGigsPath = path.join(rootDir, 'content', 'gigs-past.json');
const gigsHtmlPath = path.join(rootDir, 'gigs.html');
const galleryOriginalsPath = path.join(rootDir, '_uploads', 'gallery');
const galleryOptimizedPath = path.join(rootDir, 'images', 'optimized', 'gallery');
const imageManifestPath = path.join(rootDir, '_uploads', '.gallery-image-manifest.json');

export const GALLERY_PAGES = {
  portraits: 'gallery-portraits.html',
  gigs_2025: 'gallery-gigs-2025.html',
  gigs_2026: 'gallery-gigs-2026.html',
  siena: 'gallery-siena.html',
  other: 'gallery-other.html',
};

const GALLERY_ORDER = ['portraits', 'gigs', 'siena', 'other'];
const GIG_MARKERS = {
  upcoming: ['<!-- upcoming-gigs:auto:start -->', '<!-- upcoming-gigs:auto:end -->'],
  past: ['<!-- previous-gigs:auto:start -->', '<!-- previous-gigs:auto:end -->'],
};

function isValidIsoDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function todayInTimeZone(date = new Date(), zone = timeZone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  if (!values.year || !values.month || !values.day) {
    throw new Error(`Could not determine today's date in ${zone}.`);
  }

  return `${values.year}-${values.month}-${values.day}`;
}

function normalizeGig(entry, sourceName, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`${sourceName} entry ${index + 1} must be an object.`);
  }
  if (!isValidIsoDate(entry.date)) {
    throw new Error(`${sourceName} entry ${index + 1} has an invalid date "${entry.date ?? ''}". Expected YYYY-MM-DD.`);
  }
  if (typeof entry.venue !== 'string' || !entry.venue.trim()) {
    throw new Error(`${sourceName} entry ${index + 1} is missing a venue.`);
  }

  for (const field of ['city', 'ticketLink', 'notes']) {
    if (entry[field] !== undefined && entry[field] !== null && typeof entry[field] !== 'string') {
      throw new Error(`${sourceName} entry ${index + 1} field "${field}" must be text.`);
    }
  }

  return {
    date: entry.date,
    venue: entry.venue.trim(),
    city: typeof entry.city === 'string' ? entry.city.trim() : '',
    ticketLink: typeof entry.ticketLink === 'string' ? entry.ticketLink.trim() : '',
    notes: typeof entry.notes === 'string' ? entry.notes.trim() : '',
    sourceIndex: index,
  };
}

function compareGigDates(left, right, direction) {
  const dateComparison = left.date.localeCompare(right.date) * direction;
  return dateComparison || left.sourceIndex - right.sourceIndex;
}

export function splitAndSortGigs(upcomingEntries, pastEntries, today) {
  if (!isValidIsoDate(today)) {
    throw new Error(`Invalid comparison date "${today}". Expected YYYY-MM-DD.`);
  }

  const allGigs = [
    ...upcomingEntries.map((entry, index) => normalizeGig(entry, 'Upcoming gigs', index)),
    ...pastEntries.map((entry, index) => normalizeGig(entry, 'Past gigs', index)),
  ];

  const upcoming = [];
  const past = [];

  for (const gig of allGigs) {
    const { sourceIndex, ...savedGig } = gig;
    if (gig.date >= today) {
      upcoming.push({ ...savedGig, sourceIndex });
    } else {
      past.push({ ...savedGig, sourceIndex });
    }
  }

  upcoming.sort((left, right) => compareGigDates(left, right, 1));
  past.sort((left, right) => compareGigDates(left, right, -1));

  return {
    upcoming: upcoming.map(({ sourceIndex, ...gig }) => gig),
    past: past.map(({ sourceIndex, ...gig }) => gig),
  };
}

function validateGalleryImage(entry, index) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error(`Gallery image ${index + 1} must be an object.`);
  }

  const { image, description, gallery, alt } = entry;
  const order = entry.order === '' || entry.order === null || entry.order === undefined
    ? undefined
    : entry.order;
  const gigYear = entry.gigYear === '' || entry.gigYear === null || entry.gigYear === undefined
    ? undefined
    : Number(entry.gigYear);
  if (typeof image !== 'string' || !image.trim()) {
    throw new Error(`Gallery image ${index + 1} is missing an image path.`);
  }
  if (typeof description !== 'string') {
    throw new Error(`Gallery image ${index + 1} description must be text.`);
  }
  if (!GALLERY_ORDER.includes(gallery)) {
    throw new Error(`Gallery image ${index + 1} has an unsupported gallery "${gallery ?? ''}".`);
  }
  if (gallery === 'gigs' && ![2025, 2026].includes(gigYear)) {
    throw new Error(`Gallery image ${index + 1} must set gigYear to 2025 or 2026 for the Gigs gallery.`);
  }
  if (gigYear !== undefined && ![2025, 2026].includes(gigYear)) {
    throw new Error(`Gallery image ${index + 1} gigYear must be 2025 or 2026 when provided.`);
  }
  if (typeof alt !== 'string' || !alt.trim()) {
    throw new Error(`Gallery image ${index + 1} is missing alt text.`);
  }
  if (order !== undefined && (typeof order !== 'number' || !Number.isFinite(order))) {
    throw new Error(`Gallery image ${index + 1} order must be a finite number when provided.`);
  }

  const imagePath = image.trim().replaceAll('\\', '/').replace(/^\/+/, '');
  if (!imagePath.startsWith('images/') || imagePath.split('/').includes('..')) {
    throw new Error(`Gallery image ${index + 1} must use a local path under images/.`);
  }

  return {
    image: `/${imagePath}`,
    description,
    gallery,
    ...(gigYear === undefined ? {} : { gigYear }),
    alt: alt.trim(),
    ...(order === undefined ? {} : { order }),
    sourceIndex: index,
  };
}

function gallerySection(entry) {
  return entry.gallery === 'gigs' ? `gigs_${entry.gigYear}` : entry.gallery;
}

export function sortGalleryEntries(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('content/gallery-images.json must contain a top-level list.');
  }

  const galleries = new Set();
  const normalized = entries.map(validateGalleryImage);

  for (const entry of normalized) {
    const imageName = path.posix.basename(publicGalleryImagePath(entry.image));
    const key = `${gallerySection(entry)}\u0000${imageName.toLocaleLowerCase()}`;
    if (galleries.has(key)) {
      throw new Error(`Gallery "${entry.gallery}" contains duplicate image filename "${imageName}".`);
    }
    galleries.add(key);
  }

  normalized.sort((left, right) => {
    const galleryComparison = GALLERY_ORDER.indexOf(left.gallery) - GALLERY_ORDER.indexOf(right.gallery);
    const yearComparison = left.gallery === 'gigs' && right.gallery === 'gigs'
      ? left.gigYear - right.gigYear
      : 0;
    const orderComparison = (left.order ?? left.sourceIndex) - (right.order ?? right.sourceIndex);
    return galleryComparison || yearComparison || orderComparison || left.sourceIndex - right.sourceIndex;
  });

  return normalized.map(({ sourceIndex, ...entry }) => entry);
}

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function publicGalleryImagePath(imagePath) {
  return imagePath.replace(/\.(heic|heif)$/i, '.jpg');
}

function findDivEnd(html, startIndex) {
  const tagPattern = /<\/?div\b[^>]*>/gi;
  tagPattern.lastIndex = startIndex;
  let depth = 0;
  let match;

  while ((match = tagPattern.exec(html))) {
    if (/^<\/div/i.test(match[0])) {
      depth -= 1;
      if (depth === 0) {
        return tagPattern.lastIndex;
      }
    } else if (!/\/>$/.test(match[0])) {
      depth += 1;
    }
  }

  throw new Error('Could not find the closing tag for a gallery grid.');
}

function replaceGalleryGrid(html, markup) {
  const openTagPattern = /<div\b[^>]*class="[^"]*\bgallery-grid\b[^"]*"[^>]*>/i;
  const openTag = openTagPattern.exec(html);
  if (!openTag) {
    throw new Error('Gallery page is missing its .gallery-grid container.');
  }

  const endIndex = findDivEnd(html, openTag.index);
  const newline = html.includes('\r\n') ? '\r\n' : '\n';
  const generatedMarkup = markup.split('\n').join(newline);
  const generated = `${openTag[0]}${newline}                <!-- gallery-images:auto:start -->${newline}${generatedMarkup}${newline}                <!-- gallery-images:auto:end -->${newline}            </div>`;
  return `${html.slice(0, openTag.index)}${generated}${html.slice(endIndex)}`;
}

async function hasWebpVariant(publicPath) {
  if (path.posix.extname(publicPath).toLowerCase() === '.webp') {
    return null;
  }

  const withoutExtension = publicPath.replace(/\.[^.\/]+$/, '');
  const webpPath = `${withoutExtension}.webp`;
  const diskPath = path.join(rootDir, webpPath.replace(/^\/+/, ''));

  return await fileExists(diskPath) ? webpPath : null;
}

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

async function renderGalleryImage(entry) {
  const publicImagePath = publicGalleryImagePath(entry.image);
  const diskPath = path.join(rootDir, publicImagePath.replace(/^\/+/, ''));
  if (!await fileExists(diskPath)) {
    throw new Error(`Gallery image is missing its published file: ${publicImagePath}`);
  }
  const imagePath = htmlEscape(publicImagePath);
  const webpPath = await hasWebpVariant(publicImagePath);
  const image = `<img src="${imagePath}" alt="${htmlEscape(entry.alt)}" data-caption="" data-section="${htmlEscape(entry.gallery)}" loading="lazy">`;
  const picture = webpPath
    ? `<picture><source srcset="${htmlEscape(webpPath)}" type="image/webp">${image}</picture>`
    : image;
  return `                <div class="gallery-item">${picture}</div>`;
}

function replaceGigMarkerBlock(html, [startMarker, endMarker], markup) {
  const startIndex = html.indexOf(startMarker);
  const endIndex = html.indexOf(endMarker, startIndex + startMarker.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Gigs page is missing markers "${startMarker}" and "${endMarker}".`);
  }

  const newline = html.includes('\r\n') ? '\r\n' : '\n';
  const generatedMarkup = markup.split('\n').join(newline);
  return `${html.slice(0, startIndex + startMarker.length)}${newline}${generatedMarkup}${newline}                ${html.slice(endIndex)}`;
}

function ordinal(day) {
  if (day % 100 >= 11 && day % 100 <= 13) return 'th';
  switch (day % 10) {
    case 1: return 'st';
    case 2: return 'nd';
    case 3: return 'rd';
    default: return 'th';
  }
}

function formatGigDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  const monthName = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' }).format(date);
  return `${day}${ordinal(day)} ${monthName} ${year}`;
}

function renderGig(gig, isUpcoming) {
  const classes = isUpcoming ? 'gig-item upcoming-gig' : 'gig-item gig-item-simple';
  const city = gig.city ? ` <span class="gig-city">${htmlEscape(gig.city)}</span>` : '';
  const notes = gig.notes ? `<div class="gig-notes">${htmlEscape(gig.notes)}</div>` : '';
  return `                <div class="${classes}" data-ticket-link="${htmlEscape(gig.ticketLink)}">
                    <div class="gig-venue">${htmlEscape(gig.venue)}${city}${notes}</div>
                    <div class="gig-date">${formatGigDate(gig.date)}</div>
                </div>`;
}

async function collectImageFiles(directory) {
  let entries;
  try {
    entries = await fs.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }

  const files = [];
  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectImageFiles(entryPath));
    } else if (entry.isFile() && ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif'].includes(path.extname(entry.name).toLowerCase())) {
      files.push(entryPath);
    }
  }
  return files.sort();
}

export async function optimizeGalleryImages({
  sourceRoot = galleryOriginalsPath,
  outputRoot = galleryOptimizedPath,
  manifestPath = imageManifestPath,
} = {}) {
  const imageFiles = await collectImageFiles(sourceRoot);
  let manifest = {};
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Could not read ${path.relative(rootDir, manifestPath)}: ${error.message}`);
  }

  const nextManifest = { ...manifest };
  let processedCount = 0;

  for (const sourcePath of imageFiles) {
    const relativePath = path.relative(sourceRoot, sourcePath).split(path.sep).join('/');
    const input = await fs.readFile(sourcePath);
    const digest = createHash('sha256').update(input).digest('hex');
    const extension = path.extname(relativePath).toLowerCase();
    const outputRelativePath = extension === '.heic' || extension === '.heif'
      ? relativePath.replace(/\.(heic|heif)$/i, '.jpg')
      : relativePath;
    const targetPath = path.join(outputRoot, outputRelativePath);
    const webpPath = path.join(path.dirname(targetPath), `${path.basename(targetPath, path.extname(targetPath))}.webp`);
    const outputs = extension === '.webp' ? [targetPath] : [targetPath, webpPath];

    const outputsExist = (await Promise.all(outputs.map(fileExists))).every(Boolean);
    if (manifest[relativePath]?.digest === digest && outputsExist) {
      continue;
    }

    const imageBuffer = extension === '.heic' || extension === '.heif'
      ? await convertHeic({ buffer: input, format: 'JPEG', quality: 0.95 })
      : input;
    const metadata = await sharp(imageBuffer).metadata();
    if (!metadata.width || !metadata.height) {
      throw new Error(`Could not read image dimensions for ${relativePath}.`);
    }

    const baseTransformer = () => sharp(imageBuffer)
      .rotate()
      .resize({ width: 2560, height: 2560, fit: 'inside', withoutEnlargement: true });

    await fs.mkdir(path.dirname(targetPath), { recursive: true });
    if (extension === '.jpg' || extension === '.jpeg' || extension === '.heic' || extension === '.heif') {
      await baseTransformer().jpeg({ quality: 82, mozjpeg: true, progressive: true }).toFile(targetPath);
      await baseTransformer().webp({ quality: 82, effort: 5 }).toFile(webpPath);
    } else if (extension === '.png') {
      await baseTransformer().png({ compressionLevel: 9, effort: 8 }).toFile(targetPath);
      await baseTransformer().webp({ quality: 82, effort: 5 }).toFile(webpPath);
    } else {
      await baseTransformer().webp({ quality: 82, effort: 5 }).toFile(targetPath);
    }

    nextManifest[relativePath] = { digest, outputs: outputs.map((file) => path.relative(outputRoot, file).split(path.sep).join('/')) };
    processedCount += 1;
    console.log(`Optimized ${relativePath}`);
  }

  if (processedCount > 0 || Object.keys(nextManifest).length !== Object.keys(manifest).length) {
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, `${JSON.stringify(nextManifest, null, 2)}\n`, 'utf8');
  }

  console.log(`Gallery images optimized: ${processedCount}; unchanged: ${imageFiles.length - processedCount}.`);
  return { processedCount, unchangedCount: imageFiles.length - processedCount };
}

async function buildGalleries() {
  const rawEntries = JSON.parse(await fs.readFile(gallerySourcePath, 'utf8'));
  const entries = sortGalleryEntries(rawEntries);
  await fs.writeFile(gallerySourcePath, `${JSON.stringify(entries, null, 2)}\n`, 'utf8');

  const imageDataSource = await fs.readFile(imageDataPath, 'utf8');
  const imageData = JSON.parse(imageDataSource);
  const entriesBySection = Object.fromEntries(
    Object.keys(GALLERY_PAGES).map((section) => [
      section,
      entries.filter((image) => gallerySection(image) === section),
    ]),
  );

  for (const [section, page] of Object.entries(GALLERY_PAGES)) {
    const sectionEntries = entriesBySection[section];
    const group = {};
    for (const entry of sectionEntries) {
      const filename = path.posix.basename(publicGalleryImagePath(entry.image));
      group[filename] = entry.description;
    }
    for (const [filename, description] of Object.entries(imageData[section] ?? {})) {
      if (!Object.hasOwn(group, filename)) {
        group[filename] = description;
      }
    }
    imageData[section] = group;

    const galleryPath = path.join(rootDir, page);
    const html = await fs.readFile(galleryPath, 'utf8');
    const markup = (await Promise.all(sectionEntries.map((image) => renderGalleryImage({
      ...image,
      gallery: section,
    })))).join('\n');
    await fs.writeFile(galleryPath, replaceGalleryGrid(html, markup), 'utf8');
  }

  const imageDataNewline = imageDataSource.includes('\r\n') ? '\r\n' : '\n';
  const serializedImageData = `${JSON.stringify(imageData, null, 2)}\n`.replaceAll('\n', imageDataNewline);
  await fs.writeFile(imageDataPath, serializedImageData, 'utf8');
}

async function buildGigs() {
  const upcomingSource = JSON.parse(await fs.readFile(upcomingGigsPath, 'utf8'));
  const pastSource = JSON.parse(await fs.readFile(pastGigsPath, 'utf8'));
  if (!Array.isArray(upcomingSource) || !Array.isArray(pastSource)) {
    throw new Error('Both content/gigs-upcoming.json and content/gigs-past.json must contain top-level lists.');
  }

  const { upcoming, past } = splitAndSortGigs(upcomingSource, pastSource, todayInTimeZone());
  await fs.writeFile(upcomingGigsPath, `${JSON.stringify(upcoming, null, 2)}\n`, 'utf8');
  await fs.writeFile(pastGigsPath, `${JSON.stringify(past, null, 2)}\n`, 'utf8');

  let html = await fs.readFile(gigsHtmlPath, 'utf8');
  html = replaceGigMarkerBlock(html, GIG_MARKERS.upcoming, upcoming.map((gig) => renderGig(gig, true)).join('\n'));
  html = replaceGigMarkerBlock(html, GIG_MARKERS.past, past.map((gig) => renderGig(gig, false)).join('\n'));
  await fs.writeFile(gigsHtmlPath, html, 'utf8');
  console.log(`Built gigs page: ${upcoming.length} upcoming, ${past.length} past.`);
}

async function main() {
  await optimizeGalleryImages();
  await buildGalleries();
  await buildGigs();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
