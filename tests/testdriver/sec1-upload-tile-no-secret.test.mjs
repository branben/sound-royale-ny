import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

// ---------------------------------------------------------------------------
// SEC-1 (security) — issue #105, targeted at PR #301's NEW upload code path.
//
//   "Player secret is exposed via URL query param or console/error string.
//    Move to Authorization header / POST body / first WS message."
//
// PR #301 adds a brand-new, secret-adjacent network call: `gameApi.uploadTile()`
// in src/services/api.ts. Unlike the rest of the client it is a *raw*
// XMLHttpRequest — it does NOT go through the axios instance, so it does not
// inherit the axios request interceptor that attaches the Authorization header,
// nor the response interceptor that (elsewhere) forwards request URLs to the
// backend /errors/log/ sink. That makes it its own SEC-1 surface, and the
// repo's existing whole-tree SEC-1 gate (sec1-player-secret-not-in-url.test.mjs)
// only pins the *negative* — that no URL grows a `secret=` param. This gate adds
// the *positive* contract for the new upload path so a future edit can't
// silently regress it:
//
//   1. uploadTile builds a clean endpoint URL — `/tiles/${tileId}/play_tile/`
//      — with no query string at all, and never interpolates a credential
//      (player secret / access token) into the URL.
//   2. uploadTile authenticates via the `Authorization` header
//      (xhr.setRequestHeader('Authorization', ...)) and carries player_id in
//      the multipart body (formData.append('player_id', ...)) — the SEC-1
//      "move to Authorization header / POST body" shape.
//   3. uploadTile's failure path rejects with the backend's `error` string
//      (and at most a numeric HTTP status), NOT the raw request URL /
//      xhr.responseURL / config object — so a failed upload never persists a
//      URL (or the credential it might carry) into an error string.
//   4. uploadTile never console.*-logs the secret or the request URL.
//
// This is a source-contract regression gate (same spirit as the existing SEC-1
// static test and the PR's backend contract tests): it asserts the fix is
// present in the code, independent of a running backend. It lives in the
// TestDriver suite so it runs under vitest.testdriver.config.mjs alongside the
// other SEC-1 gates.
//
// Run with:
//   npx vitest run --config vitest.testdriver.config.mjs \
//     tests/testdriver/sec1-upload-tile-no-secret.test.mjs
// ---------------------------------------------------------------------------

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..', '..');
const apiTsPath = join(repoRoot, 'src', 'services', 'api.ts');
const API_SOURCE = readFileSync(apiTsPath, 'utf8');

/**
 * Strip line (`//`) and block comments so the doc comments that legitimately
 * discuss `?secret=` / the URL while explaining the fix don't trip the scans —
 * we only want to gate on executable code. (Leave `://` in URLs intact by
 * requiring the `//` not be preceded by a `:`.)
 */
function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1');
}

/**
 * Extract the `uploadTile` method body from api.ts. The whole implementation
 * lives inside its `new Promise((resolve, reject) => { ... })` executor, so we
 * anchor on the method's `new Promise(` and brace-match that call to its
 * balanced closing `)`. Isolating the method means the assertions below concern
 * the upload path specifically and are neither satisfied nor tripped by
 * unrelated code elsewhere in api.ts.
 *
 * (We deliberately do NOT brace-match from the first `=>`/`{` after the
 * `uploadTile:` label — the method's `options` parameter type contains inner
 * arrows and a `= {}` default that would mis-anchor the walk.)
 */
function extractUploadTile(source) {
  const code = stripComments(source);
  const label = code.search(/\buploadTile\s*:/);
  if (label === -1) return null;
  const promiseStart = code.indexOf('new Promise(', label);
  if (promiseStart === -1) return null;
  const parenStart = code.indexOf('(', promiseStart + 'new Promise'.length);
  let depth = 0;
  for (let j = parenStart; j < code.length; j++) {
    const ch = code[j];
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) {
        // Include the `uploadTile: (...) => new Promise(...)` preamble so the
        // sanity/URL scans see the whole method, not just the executor body.
        return code.slice(label, j + 1);
      }
    }
  }
  return code.slice(label); // unbalanced; return the rest defensively
}

const UPLOAD_TILE = extractUploadTile(API_SOURCE);

// Credential identifiers that must never appear in a URL the upload builds.
const SECRET_IDENTIFIERS =
  /\b(?:playerSecret|player_secret|sessionSecret|discord_session_secret|discordSessionSecret|accessToken)\b/;

describe('SEC-1: gameApi.uploadTile keeps the secret out of the URL / console (#105, PR #301)', () => {
  it('exposes the uploadTile source under review (sanity)', () => {
    // Guard against a rename/move silently turning this gate into a no-op.
    expect(UPLOAD_TILE, 'gameApi.uploadTile not found in src/services/api.ts').not.toBeNull();
    // It really is the raw-XHR upload path (the reason it needs its own gate).
    expect(UPLOAD_TILE).toMatch(/new\s+XMLHttpRequest\s*\(/);
  });

  it('builds a clean endpoint URL with no query string and no credential', () => {
    // The endpoint is assigned once: `const url = \`${API_BASE_URL}/tiles/...\`;`.
    // Grab that template literal (the value assigned to a `url` identifier) and
    // assert it carries no query string and interpolates no credential.
    const urlAssign = UPLOAD_TILE.match(/\burl\s*=\s*(`[^`]*`)/);
    expect(urlAssign, 'uploadTile must assign its endpoint to a `url` template literal').not.toBeNull();
    const urlTemplate = urlAssign[1];

    expect(urlTemplate, `upload URL must have no query string: ${urlTemplate}`).not.toMatch(/[?&]/);
    expect(
      urlTemplate,
      `upload URL must not interpolate a credential: ${urlTemplate}`,
    ).not.toMatch(SECRET_IDENTIFIERS);
    // The request must open against that clean `url` (not some re-built string).
    expect(UPLOAD_TILE).toMatch(/\.open\(\s*['"`]POST['"`]\s*,\s*url\b/);

    // Belt-and-suspenders: no `secret=` / `player_secret=` query param anywhere
    // in the method (the exact SEC-1 leak shape the whole-tree gate forbids).
    expect(UPLOAD_TILE).not.toMatch(/[?&](?:secret|player_secret|discord_session_secret)=/i);
    expect(UPLOAD_TILE).not.toMatch(
      /searchParams\.(?:set|append)\(\s*['"`](?:secret|player_secret|discord_session_secret)['"`]/i,
    );
  });

  it('authenticates via the Authorization header and POST body, not the URL', () => {
    // SEC-1's prescribed shape: credential in the Authorization header / POST
    // body. Assert the upload actually attaches the header and puts player_id
    // in the multipart form body (both are POST-body/header, never the URL).
    expect(
      UPLOAD_TILE,
      'uploadTile must attach an Authorization header (xhr.setRequestHeader) rather than putting a credential in the URL',
    ).toMatch(/setRequestHeader\(\s*['"`]Authorization['"`]/i);
    expect(
      UPLOAD_TILE,
      "uploadTile must carry player_id in the multipart POST body (formData.append('player_id', ...))",
    ).toMatch(/formData\.append\(\s*['"`]player_id['"`]/i);
    // And it must POST (never encode auth-bearing data into a GET query string).
    expect(UPLOAD_TILE).toMatch(/\.open\(\s*['"`]POST['"`]/i);
  });

  it('rejects with the backend error string on failure — never the raw URL / xhr / config', () => {
    // The error path must surface the backend `error` string (a numeric HTTP
    // status is fine), NOT the raw request URL / xhr.responseURL / config
    // object, so a failed upload can never leak a URL (and any credential it
    // might carry) into an Error that flows to a toast, a log, or /errors/log/.
    expect(
      UPLOAD_TILE,
      'uploadTile should reject with the parsed backend `error` field on non-2xx',
    ).toMatch(/data\s*\??\.\s*error/);

    // Inspect each `reject(new Error(...))` argument individually.
    const rejects = UPLOAD_TILE.match(/reject\(\s*new\s+Error\([\s\S]*?\)\s*\)/g) ?? [];
    expect(
      rejects.length,
      'expected uploadTile to reject with Error(...) on its failure paths',
    ).toBeGreaterThan(0);
    for (const r of rejects) {
      // The request URL must never be embedded in the thrown error.
      expect(r, `an upload rejection must not embed the request URL: ${r}`).not.toMatch(
        /\burl\b|\.responseURL\b/,
      );
      // The raw xhr / axios config object must never be embedded. A NUMERIC
      // status (`xhr.status` / `xhr.statusText`) is allowed — it carries no
      // credential — so strip those accessors before checking for a bare
      // `xhr` / `config` reference.
      const withoutStatus = r.replace(/xhr\.status(?:Text)?/g, '');
      expect(
        withoutStatus,
        `an upload rejection must not embed the raw xhr / config object: ${r}`,
      ).not.toMatch(/\bxhr\b|\bconfig\b/);
    }
  });

  it('never logs the secret or the request URL to the console', () => {
    // Second SEC-1 vector: the credential (or a URL that embeds one) landing in
    // a console.* call. The upload path must not console.* the secret or its URL.
    const consoleCalls =
      UPLOAD_TILE.match(/console\.(?:log|error|warn|info|debug)\([^)]*\)/g) ?? [];
    for (const call of consoleCalls) {
      expect(call, `console call must not print a credential: ${call}`).not.toMatch(
        SECRET_IDENTIFIERS,
      );
      expect(call, `console call must not print the request URL: ${call}`).not.toMatch(/\burl\b/);
    }
  });
});
