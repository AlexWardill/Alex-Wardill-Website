import fs from 'node:fs/promises';
import path from 'node:path';

const rootDir = process.cwd();
const contentDir = path.join(rootDir, 'content', 'gigs');
const outputDir = path.join(rootDir, 'data');
const outputFile = path.join(outputDir, 'cms-content.json');

function parseFrontMatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);

  if (!match) {
    return { frontMatter: {}, body: markdown };
  }

  const frontMatter = {};
  for (const line of match[1].split(/\r?\n/)) {
    if (!line.includes(':')) {
      continue;
    }

    const separatorIndex = line.indexOf(':');
    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (!key) {
      continue;
    }

    let value = rawValue;
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    frontMatter[key] = value;
  }

  return { frontMatter, body: match[2] };
}

async function collectGigs() {
  const entries = await fs.readdir(contentDir, { withFileTypes: true });
  const gigs = [];

  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) {
      continue;
    }

    const filePath = path.join(contentDir, entry.name);
    const source = await fs.readFile(filePath, 'utf8');
    const { frontMatter } = parseFrontMatter(source);

    if (!frontMatter.title || !frontMatter.date || !frontMatter.venue) {
      continue;
    }

    gigs.push({
      title: frontMatter.title,
      venue: frontMatter.venue,
      date: frontMatter.date,
      ticketUrl: frontMatter.ticketUrl || '',
      notes: frontMatter.notes || '',
    });
  }

  gigs.sort((left, right) => new Date(left.date) - new Date(right.date));
  return gigs;
}

try {
  await fs.mkdir(outputDir, { recursive: true });
  const gigs = await collectGigs();
  await fs.writeFile(outputFile, `${JSON.stringify({ gigs }, null, 2)}\n`, 'utf8');
  console.log(`Wrote ${gigs.length} gigs to ${path.relative(rootDir, outputFile)}`);
} catch (error) {
  console.error(error);
  process.exitCode = 1;
}
