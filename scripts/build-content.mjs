import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import convertHeic from 'heic-convert';
import { renderGigListHtml } from '../js/cms-content.js';

const rootDir = process.cwd();
const timeZone = process.env.GIGS_TIME_ZONE || 'Europe/London';
const gallerySourcePath = path.join(rootDir, 'content', 'gallery-images.json');
const imageDataPath = path.join(rootDir, 'image_data.json');
const upcomingGigsPath = path.join(rootDir, 'content', 'gigs-upcoming.json');
const pastGigsPath = path.join(rootDir, 'content', 'gigs-past.json');
const cmsGigDataPath = path.join(rootDir, 'data', 'cms-content.json');
const gigsHtmlPath = path.join(rootDir, 'gigs', 'index.html');
const homeHtmlPath = path.join(rootDir, 'index.html');
const galleryOriginalsPath = path.join(rootDir, '_uploads', 'gallery');
const galleryOptimizedPath = path.join(rootDir, 'images', 'optimized', 'uploads');
const imageManifestPath = path.join(rootDir, '_uploads', '.gallery-image-manifest.json');

export const GALLERY_PAGES = {
  portraits: 'gallery-portraits/index.html',
  gigs: 'gallery-gigs/index.html',
  siena: 'gallery-siena/index.html',
  other: 'gallery-other/index.html',
};

const GALLERY_ORDER = ['portraits', 'gigs', 'siena', 'other'];
const GIG_MARKERS = {
  upcoming: ['<!-- upcoming-gigs:auto:start -->', '<!-- upcoming-gigs:auto:end -->'],
  past: ['<!-- previous-gigs:auto:start -->', '<!-- previous-gigs:auto:end -->'],
  home: ['<!-- home-gigs:auto:start -->', '<!-- home-gigs:auto:end -->'],
};
const HOME_GIG_LIMIT = 5;

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
  if (typeof entry.band !== 'string' || !entry.band.trim()) {
    throw new Error(`${sourceName} entry ${index + 1} is missing a band name.`);
  }

  for (const field of ['event', 'venue', 'time', 'city', 'ticketLink']) {
    if (entry[field] !== undefined && entry[field] !== null && typeof entry[field] !== 'string') {
      throw new Error(`${sourceName} entry ${index + 1} field "${field}" must be text.`);
    }
  }

  const text = (field) => (typeof entry[field] === 'string' ? entry[field].trim() : '');

  return {
    date: entry.date,
    band: entry.band.trim(),
    event: text('event'),
    venue: text('venue'),
    time: text('time'),
    city: text('city'),
    ticketLink: text('ticketLink'),
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
  if (typeof image !== 'string' || !image.trim()) {
    throw new Error(`Gallery image ${index + 1} is missing an image path.`);
  }
  if (typeof description !== 'string') {
    throw new Error(`Gallery image ${index + 1} description must be text.`);
  }
  if (!GALLERY_ORDER.includes(gallery)) {
    throw new Error(`Gallery image ${index + 1} has an unsupported gallery "${gallery ?? ''}".`);
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
    alt: alt.trim(),
    ...(order === undefined ? {} : { order }),
    sourceIndex: index,
  };
}

function gallerySection(entry) {
  return entry.gallery;
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
    const orderComparison = (left.order ?? left.sourceIndex) - (right.order ?? right.sourceIndex);
    return galleryComparison || orderComparison || left.sourceIndex - right.sourceIndex;
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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

export const GRID_WIDTHS = [400, 800, 1200];
export const LIGHTBOX_LONG_EDGE = 1800;
const VARIANT_WEBP_OPTIONS = { quality: 80, effort: 5 };
const GALLERY_SIZES = '(max-width: 768px) calc(100vw - 2rem), (max-width: 972px) 45vw, (max-width: 1275px) 29vw, (max-width: 1523px) 23vw, 342px';

export function encodePublicPath(publicPath) {
  return publicPath.split('/').map(encodeURIComponent).join('/');
}

export function responsiveBasePath(publicImagePath) {
  const withoutExtension = publicImagePath.replace(/\.[^./]+$/, '');
  return withoutExtension.startsWith('/images/optimized/')
    ? withoutExtension
    : withoutExtension.replace(/^\/images\//, '/images/optimized/');
}

async function variantDimensions(file) {
  const { width, height } = await sharp(file).metadata();
  return { width, height };
}

export async function ensureResponsiveVariants(sourcePath, basePath) {
  const metadata = await sharp(sourcePath).metadata();
  const sourceWidth = metadata.orientation >= 5 ? metadata.height : metadata.width;
  if (!sourceWidth) {
    throw new Error(`Could not read image dimensions for ${sourcePath}.`);
  }

  await fs.mkdir(path.dirname(basePath), { recursive: true });
  const grid = [];
  for (const width of GRID_WIDTHS) {
    const file = `${basePath}-${width}.webp`;
    if (!await fileExists(file)) {
      if (width >= sourceWidth) continue;
      await sharp(sourcePath).rotate().resize({ width }).webp(VARIANT_WEBP_OPTIONS).toFile(file);
    }
    grid.push({ suffix: String(width), ...await variantDimensions(file) });
  }

  const lightboxFile = `${basePath}-lightbox.webp`;
  if (!await fileExists(lightboxFile)) {
    await sharp(sourcePath)
      .rotate()
      .resize({ width: LIGHTBOX_LONG_EDGE, height: LIGHTBOX_LONG_EDGE, fit: 'inside', withoutEnlargement: true })
      .webp(VARIANT_WEBP_OPTIONS)
      .toFile(lightboxFile);
  }

  return { grid, lightbox: { suffix: 'lightbox', ...await variantDimensions(lightboxFile) } };
}

export function buildSrcset(basePath, grid) {
  const seen = new Set();
  return grid
    .filter(({ width }) => !seen.has(width) && seen.add(width))
    .map(({ suffix, width }) => `${htmlEscape(encodePublicPath(`${basePath}-${suffix}.webp`))} ${width}w`)
    .join(', ');
}

async function renderGalleryImage(entry) {
  const publicImagePath = publicGalleryImagePath(entry.image);
  const diskPath = path.join(rootDir, publicImagePath.replace(/^\/+/, ''));
  if (!await fileExists(diskPath)) {
    throw new Error(`Gallery image is missing its published file: ${publicImagePath}`);
  }

  const basePath = responsiveBasePath(publicImagePath);
  const { grid, lightbox } = await ensureResponsiveVariants(diskPath, path.join(rootDir, basePath.replace(/^\/+/, '')));
  const fallback = grid.find(({ suffix }) => suffix === '800') ?? grid.at(-1) ?? lightbox;
  const variantUrl = (variant) => htmlEscape(encodePublicPath(`${basePath}-${variant.suffix}.webp`));
  const srcset = grid.length > 1
    ? ` srcset="${buildSrcset(basePath, grid)}" sizes="${GALLERY_SIZES}"`
    : '';
  const name = path.posix.basename(publicImagePath);

  const image = `<img src="${variantUrl(fallback)}" alt="${htmlEscape(entry.alt)}" width="${fallback.width}" height="${fallback.height}" data-caption="" data-section="${htmlEscape(entry.gallery)}" data-name="${htmlEscape(name)}" loading="lazy" decoding="async" data-full-src="${variantUrl(lightbox)}"${srcset}>`;
  return `                <div class="gallery-item">${image}</div>`;
}

function replaceGigMarkerBlock(html, [startMarker, endMarker], markup) {
  const startIndex = html.indexOf(startMarker);
  const endIndex = html.indexOf(endMarker, startIndex + startMarker.length);
  if (startIndex < 0 || endIndex < 0) {
    throw new Error(`Page is missing markers "${startMarker}" and "${endMarker}".`);
  }

  const newline = html.includes('\r\n') ? '\r\n' : '\n';
  const generatedMarkup = markup.split('\n').join(newline);
  return `${html.slice(0, startIndex + startMarker.length)}${newline}${generatedMarkup}${newline}                ${html.slice(endIndex)}`;
}

function indentLines(markup, spaces) {
  return markup.split('\n').map((line) => ' '.repeat(spaces) + line).join('\n');
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

    const stem = targetPath.slice(0, -path.extname(targetPath).length);
    for (const suffix of [...GRID_WIDTHS, 'lightbox']) {
      await fs.rm(`${stem}-${suffix}.webp`, { force: true });
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

  await fs.writeFile(cmsGigDataPath, `${JSON.stringify({ gigs: [...upcoming, ...past] }, null, 2)}\n`, 'utf8');

  let html = await fs.readFile(gigsHtmlPath, 'utf8');
  html = replaceGigMarkerBlock(html, GIG_MARKERS.upcoming, indentLines(renderGigListHtml(upcoming, 'upcoming'), 16));
  html = replaceGigMarkerBlock(html, GIG_MARKERS.past, indentLines(renderGigListHtml(past, 'previous'), 16));
  await fs.writeFile(gigsHtmlPath, html, 'utf8');

  const homeHtml = await fs.readFile(homeHtmlPath, 'utf8');
  await fs.writeFile(homeHtmlPath, replaceGigMarkerBlock(homeHtml, GIG_MARKERS.home, indentLines(renderGigListHtml(upcoming.slice(0, HOME_GIG_LIMIT), 'home'), 16)), 'utf8');
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
