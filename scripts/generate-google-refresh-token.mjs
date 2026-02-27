import fs from 'node:fs/promises';
import process from 'node:process';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import { google } from 'googleapis';

const OAUTH_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';
const REDIRECT_URI = 'http://127.0.0.1:53682/oauth2callback';

function parseArgs(argv) {
  const args = {
    credentialsPath: null,
    setGhSecret: false,
    repo: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--credentials' && argv[index + 1]) {
      args.credentialsPath = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === '--set-gh-secret') {
      args.setGhSecret = true;
      continue;
    }

    if (value === '--repo' && argv[index + 1]) {
      args.repo = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

async function loadCredentials(credentialsPath) {
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    return {
      clientId: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    };
  }

  const resolvedPath = credentialsPath ?? process.env.GOOGLE_OAUTH_CREDENTIALS_FILE;
  if (!resolvedPath) {
    throw new Error('Provide --credentials <path-to-json> or set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.');
  }

  const raw = await fs.readFile(resolvedPath, 'utf8');
  const parsed = JSON.parse(raw);
  const creds = parsed.installed ?? parsed.web;

  if (!creds?.client_id || !creds?.client_secret) {
    throw new Error('Invalid credentials JSON. Expected installed/web.client_id and client_secret.');
  }

  return {
    clientId: creds.client_id,
    clientSecret: creds.client_secret,
  };
}

function saveGitHubSecret(refreshToken, repo) {
  const args = ['secret', 'set', 'GOOGLE_REFRESH_TOKEN', '--body', refreshToken];
  if (repo) {
    args.push('--repo', repo);
  }

  const result = spawnSync('gh', args, { stdio: 'inherit', shell: process.platform === 'win32' });
  if (result.error) {
    throw new Error(`Failed to run gh CLI: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error('gh secret set failed. Ensure gh is installed and authenticated.');
  }
}

function waitForAuthorizationCode() {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for OAuth callback.'));
    }, 180000);

    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? '', REDIRECT_URI);
      if (url.pathname !== '/oauth2callback') {
        res.statusCode = 404;
        res.end('Not found');
        return;
      }

      const code = url.searchParams.get('code');
      const error = url.searchParams.get('error');

      if (error) {
        clearTimeout(timeout);
        server.close();
        res.statusCode = 400;
        res.end('Authorization failed. You can close this window.');
        reject(new Error(`Authorization failed: ${error}`));
        return;
      }

      if (!code) {
        clearTimeout(timeout);
        server.close();
        res.statusCode = 400;
        res.end('Missing code. You can close this window.');
        reject(new Error('Missing authorization code in callback.'));
        return;
      }

      clearTimeout(timeout);
      server.close();
      res.statusCode = 200;
      res.end('Authorization complete. You can close this window.');
      resolve(code);
    });

    server.listen(53682, '127.0.0.1', () => {
      console.log('Waiting for OAuth callback on http://127.0.0.1:53682/oauth2callback ...');
    });

    server.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const { clientId, clientSecret } = await loadCredentials(args.credentialsPath);

  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [OAUTH_SCOPE],
  });

  console.log('Open this URL in your browser and approve access:');
  console.log(url);
  console.log('');

  let code;
  try {
    code = await waitForAuthorizationCode();
  } catch {
    const rl = readline.createInterface({ input, output });
    code = await rl.question('Could not auto-capture callback. Paste the authorization code: ');
    rl.close();
  }

  const tokenResponse = await oauth2Client.getToken(code.trim());
  const refreshToken = tokenResponse.tokens.refresh_token;

  if (!refreshToken) {
    throw new Error('No refresh token returned. Re-run and ensure prompt=consent, or revoke previous app consent first.');
  }

  console.log('');
  console.log('Generated GOOGLE_REFRESH_TOKEN:');
  console.log(refreshToken);

  if (args.setGhSecret) {
    saveGitHubSecret(refreshToken, args.repo);
    console.log('Stored GOOGLE_REFRESH_TOKEN in GitHub Actions secrets.');
  } else {
    console.log('Copy this token into GitHub Actions secret GOOGLE_REFRESH_TOKEN.');
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
