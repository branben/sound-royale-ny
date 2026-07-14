#!/usr/bin/env node
/**
 * SEC-1 harness — exercise the REAL frontend URL builders and report whether a
 * player secret leaks into any request URL / query string.
 *
 * SEC-1 (issue #105): the player secret must NEVER travel in a URL query param
 * (or any console/error string). It belongs in an Authorization header, a POST
 * body, or the first WebSocket message. Two known leak sites are gated here:
 *
 *   1. src/services/gameSocket.ts  -> getWsUrl()
 *        `url.searchParams.set('secret', this.options.playerSecret)`   [WS URL]
 *   2. src/services/api.ts         -> getAccountStatus()
 *        `/auth/discord/status/?player_id=...&player_secret=${playerSecret}` [GET]
 *
 * This harness does NOT reimplement those builders — that would let the gate
 * pass even if the real code still leaks. Instead it loads the REAL source
 * files (staged into the sandbox by the test), extracts the exact URL-building
 * code, evaluates it with a unique CANARY secret, and prints the URL(s) it
 * produced. The test then asserts the canary never appears in a URL.
 *
 * Determinism: no network, no Vite, no TS compiler. We isolate the tiny piece
 * of real source that builds the URL, neutralize only the ambient bindings it
 * can't run without in Node (`import.meta.env`, TS `!` non-null assertions),
 * and run it.
 *
 * Three outcomes per probe (so the test can tell a leak from a fix from a
 * broken extraction):
 *   WS_URL=<url>                 the WS builder ran; assert canary NOT present
 *   WS_MATCH_FAIL=<reason>       could not locate/run getWsUrl -> gate errors
 *
 *   DISCORD_STATUS_URL=<url>     the leaky player_secret query template exists
 *   DISCORD_NO_LEAK=<detail>     /auth/discord/status/ exists but query carries
 *                                no player_secret -> the SEC-1 fix is in place
 *   DISCORD_MATCH_FAIL=<reason>  the status endpoint is gone entirely -> error
 *
 * Usage:
 *   SEC1_GAMESOCKET_TS=/path/gameSocket.ts \
 *   SEC1_API_TS=/path/api.ts \
 *   SEC1_CANARY=<unique-token> \
 *   node sec1_url_harness.cjs
 */

'use strict';

const fs = require('node:fs');

const CANARY = process.env.SEC1_CANARY || 'SEC1CANARYSECRET';
const gameSocketPath = process.env.SEC1_GAMESOCKET_TS;
const apiPath = process.env.SEC1_API_TS;

function read(p) {
  if (!p || !fs.existsSync(p)) {
    throw new Error(`source file not found: ${p}`);
  }
  return fs.readFileSync(p, 'utf8');
}

/* ------------------------------------------------------------------ *
 * Probe 1 — WebSocket connect URL (gameSocket.ts::getWsUrl)
 *
 * Extract the body of getWsUrl() from the real source, then run it in a
 * sandbox where `import.meta.env` is empty (forcing the localhost default,
 * exactly as it behaves with no VITE_* env) and `this.options` carries the
 * canary secret. Whatever URL the REAL builder returns is printed verbatim.
 * ------------------------------------------------------------------ */
function probeWsUrl() {
  const src = read(gameSocketPath);
  const start = src.indexOf('getWsUrl');
  if (start === -1) return 'WS_MATCH_FAIL=getWsUrl not found in gameSocket.ts';

  // Grab from the opening brace of the method to its matching close brace.
  const braceOpen = src.indexOf('{', start);
  if (braceOpen === -1) return 'WS_MATCH_FAIL=no method body';
  let depth = 0;
  let end = -1;
  for (let i = braceOpen; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end === -1) return 'WS_MATCH_FAIL=unbalanced braces';

  let body = src.slice(braceOpen + 1, end);

  // Neutralize the two Node-incompatible bindings the extracted body uses:
  //  - `import.meta.env.X`  -> undefined (so the localhost fallback runs)
  //  - `this.options!`      -> the injected options object (strip TS `!`)
  body = body
    .replace(/import\.meta\.env\.[A-Za-z0-9_]+/g, 'undefined')
    .replace(/this\.options!/g, 'opts')
    .replace(/this\.options\b/g, 'opts');

  const runner = new Function('opts', `"use strict";\n${body}`);

  const url = runner({
    gameId: 'ROOM123',
    playerId: 'player-1',
    playerSecret: CANARY,
    // no accessToken -> forces the player_secret fallback branch (the leak path)
  });

  return `WS_URL=${url}`;
}

/* ------------------------------------------------------------------ *
 * Probe 2 — Discord account-status GET (api.ts::getAccountStatus)
 *
 * If the leaky template (`...?player_id=...&player_secret=${...}`) still
 * exists, evaluate it with the canary and print the URL. If the status
 * endpoint exists but no longer carries player_secret in the query, that is
 * the fixed state (DISCORD_NO_LEAK). If the endpoint is gone entirely, the
 * extraction failed (DISCORD_MATCH_FAIL) and the gate errors.
 * ------------------------------------------------------------------ */
function probeDiscordStatusUrl() {
  const src = read(apiPath);

  const leaky = src.match(
    /`\/auth\/discord\/status\/\?player_id=\$\{[^}]+\}&player_secret=\$\{[^}]+\}`/,
  );
  if (leaky) {
    const tpl = leaky[0]
      .replace(/\$\{[^}]*player_id[^}]*\}/i, '${playerId}')
      // any remaining ${...} in this template is the secret interpolation
      .replace(/\$\{(?!playerId\})[^}]+\}/g, '${playerSecret}');
    const runner = new Function('playerId', 'playerSecret', `"use strict"; return ${tpl};`);
    return `DISCORD_STATUS_URL=${runner('player-1', CANARY)}`;
  }

  // Not leaking via that template. Is the endpoint present at all?
  if (src.includes('/auth/discord/status/')) {
    // Present, but no player_secret query interpolation -> SEC-1 fix applied.
    // Extra belt-and-suspenders: flag if `player_secret` appears anywhere in a
    // status-path query template (any interpolation), which would still leak.
    const anyStatusSecretQuery = src.match(/`\/auth\/discord\/status\/\?[^`]*player_secret=[^`]*`/);
    if (anyStatusSecretQuery) {
      return `DISCORD_STATUS_URL=${anyStatusSecretQuery[0].replace(/[`$]|\{[^}]*\}/g, (mm) =>
        mm === '`' ? '' : mm.startsWith('{') ? CANARY : '',
      )}`;
    }
    return 'DISCORD_NO_LEAK=/auth/discord/status/ present with no player_secret query param';
  }

  return 'DISCORD_MATCH_FAIL=/auth/discord/status/ endpoint not found in api.ts';
}

function safe(fn, failPrefix) {
  try {
    return fn();
  } catch (e) {
    return `${failPrefix}=${(e && e.message) || String(e)}`;
  }
}

process.stdout.write(safe(probeWsUrl, 'WS_MATCH_FAIL') + '\n');
process.stdout.write(safe(probeDiscordStatusUrl, 'DISCORD_MATCH_FAIL') + '\n');
