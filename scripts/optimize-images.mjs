import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import sharp from 'sharp';

function parseArgs(argv) {
  const args = {};

  for (let index = 2; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith('--')) {
      continue;
    }

    const [key, inlineValue] = token.slice(2).split('=');

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const nextToken = argv[index + 1];
    if (!nextToken || nextToken.startsWith('--')) {
      args[key] = true;
      continue;
    }

    args[key] = nextToken;
    index += 1;
  }

  return args;
}

async function listFilesRecursively(dirPath) {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      const nested = await listFilesRecursively(fullPath);
      files.push(...nested);
      continue;
    }

    if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

function formatBytes(bytes) {
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function isOptimizableFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ['.jpg', '.jpeg', '.png', '.webp', '.avif'].includes(ext);
}

function buildBackupDirName() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `_originals_backup_${year}-${month}-${day}`;
}

async function optimizeImage({
  filePath,
  relativePath,
  sourceRoot,
  backupRoot,
  maxDimension,
  jpegQuality,
  webpQuality,
  dryRun,
}) {
  const ext = path.extname(filePath).toLowerCase();
  const inputBuffer = await fs.readFile(filePath);
  const originalBytes = inputBuffer.length;

  const metadata = await sharp(inputBuffer).metadata();
  const width = metadata.width ?? 0;
  const height = metadata.height ?? 0;

  const transformer = sharp(inputBuffer, { failOn: 'none' })
    .rotate()
    .resize({
      width: maxDimension,
      height: maxDimension,
      fit: 'inside',
      withoutEnlargement: true,
    });

  if (ext === '.jpg' || ext === '.jpeg') {
    transformer.jpeg({ quality: jpegQuality, mozjpeg: true, progressive: true });
  } else if (ext === '.png') {
    transformer.png({ compressionLevel: 9, palette: true, quality: 90, effort: 8 });
  } else if (ext === '.webp') {
    transformer.webp({ quality: webpQuality, effort: 5 });
  } else if (ext === '.avif') {
    transformer.avif({ quality: Math.min(webpQuality, 60), effort: 5 });
  }

  const outputBuffer = await transformer.toBuffer();
  const optimizedBytes = outputBuffer.length;
  const savedBytes = originalBytes - optimizedBytes;

  if (savedBytes <= 0) {
    return {
      changed: false,
      skippedReason: 'not-smaller',
      originalBytes,
      optimizedBytes,
      relativePath,
      width,
      height,
    };
  }

  if (!dryRun) {
    const backupFilePath = path.join(backupRoot, relativePath);
    await fs.mkdir(path.dirname(backupFilePath), { recursive: true });
    await fs.copyFile(filePath, backupFilePath);
    await fs.writeFile(filePath, outputBuffer);
  }

  return {
    changed: true,
    originalBytes,
    optimizedBytes,
    savedBytes,
    relativePath,
    width,
    height,
  };
}

async function run() {
  const args = parseArgs(process.argv);
  const workspaceRoot = process.cwd();
  const sourceArg = typeof args.source === 'string' ? args.source : 'images';
  const sourceRoot = path.resolve(workspaceRoot, sourceArg);
  const maxDimension = Number.parseInt(String(args['max-dimension'] ?? 2560), 10);
  const jpegQuality = Number.parseInt(String(args['jpeg-quality'] ?? 82), 10);
  const webpQuality = Number.parseInt(String(args['webp-quality'] ?? 82), 10);
  const dryRun = args['dry-run'] === true;

  if (!Number.isFinite(maxDimension) || maxDimension <= 0) {
    throw new Error('Invalid --max-dimension value.');
  }

  const backupArg =
    typeof args['backup-dir'] === 'string'
      ? args['backup-dir']
      : path.join(sourceArg, buildBackupDirName());

  const backupRoot = path.resolve(workspaceRoot, backupArg);

  if (sourceRoot === backupRoot) {
    throw new Error('Source and backup directories must be different.');
  }

  await fs.mkdir(sourceRoot, { recursive: true });
  await fs.mkdir(backupRoot, { recursive: true });

  const allFiles = await listFilesRecursively(sourceRoot);
  const optimizable = allFiles
    .filter((filePath) => !filePath.startsWith(backupRoot + path.sep))
    .filter(isOptimizableFile);

  console.log(`Found ${optimizable.length} image files in '${sourceArg}'.`);
  console.log(`Backup folder: ${path.relative(workspaceRoot, backupRoot)}`);
  console.log(`Mode: ${dryRun ? 'dry-run' : 'write'} | max-dimension=${maxDimension} | jpeg-quality=${jpegQuality} | webp-quality=${webpQuality}`);

  let changedCount = 0;
  let skippedCount = 0;
  let totalOriginal = 0;
  let totalOptimized = 0;
  let totalSaved = 0;

  for (const filePath of optimizable) {
    const relativePath = path.relative(sourceRoot, filePath);

    try {
      const result = await optimizeImage({
        filePath,
        relativePath,
        sourceRoot,
        backupRoot,
        maxDimension,
        jpegQuality,
        webpQuality,
        dryRun,
      });

      totalOriginal += result.originalBytes;
      totalOptimized += result.optimizedBytes;

      if (result.changed) {
        changedCount += 1;
        totalSaved += result.savedBytes;
        console.log(`✓ ${relativePath} | ${formatBytes(result.originalBytes)} -> ${formatBytes(result.optimizedBytes)}`);
      } else {
        skippedCount += 1;
      }
    } catch (error) {
      skippedCount += 1;
      console.warn(`! Skipped ${relativePath}: ${error.message}`);
    }
  }

  console.log('---');
  console.log(`Processed: ${optimizable.length}`);
  console.log(`Optimized: ${changedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Original total: ${formatBytes(totalOriginal)}`);
  console.log(`Optimized total: ${formatBytes(totalOptimized)}`);
  console.log(`Saved: ${formatBytes(totalSaved)}`);
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
