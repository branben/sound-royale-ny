// Sound Royale prod smoke sweep — Step 6 (robust: inject creds, load room)
// Usage: ROOM_CODE=xxxx PLAYER_ID=... PLAYER_SECRET=... ego-browser nodejs < dogfood-sweep.js
const FRONTEND = 'https://soundroyale.pages.dev';
const BEAT = '/Users/brandonbennett/sound-royale-ny/.verify_beat.wav';
const fs = require('fs');
const C = JSON.parse(fs.readFileSync('/tmp/sr_creds.json', 'utf8'));
const ROOM = C.room_code;
const PID = C.player_id;
const PSEC = C.player_secret;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const clickByText = `(function(needle){const els=[...document.querySelectorAll('button,a,[role=button],input')];const el=els.find(x=>(x.textContent||x.value||'').trim().toLowerCase().includes(needle.toLowerCase()));if(el){el.click();return true;}return false;})`;

(async () => {
  if (!ROOM || !PID || !PSEC) {
    console.error('Missing ROOM_CODE/PLAYER_ID/PLAYER_SECRET env');
    process.exit(2);
  }
  const ts = await ego.createTaskSpace('sr-smoke-' + Date.now());
  await ego.useTaskSpace(ts.id);
  const h = ego.helpers;
  const results = { steps: [], errors: [] };
  const snapText = async () => {
    for (let i = 0; i < 6; i++) {
      try {
        const s = await h.snapshotText();
        if (s && s.length > 40) return s;
      } catch (e) {}
      await sleep(1200);
    }
    return '';
  };

  // Load landing, dismiss onboarding, inject creds
  await h.gotoUrl(FRONTEND, { waitUntil: 'networkidle' });
  await sleep(2000);
  await h.js(clickByText + `('let\\'s play')`).catch(() => {});
  await sleep(1500);
  let s = await snapText();
  if (s.includes('Let') && s.includes('Play')) {
    await h.js(clickByText + `('close')`);
    await sleep(1500);
  }

  // Inject player credentials into localStorage (app reads playerId/playerSecret/playerName)
  await h.js(
    `localStorage.setItem('playerId','${PID}');localStorage.setItem('playerSecret','${PSEC}');localStorage.setItem('playerName','SmokeTest');localStorage.setItem('lastRoomCode','${ROOM}');`,
  );
  results.steps.push({ step: 'credsInjected', pid: PID.slice(0, 8), room: ROOM });

  // Navigate to the room
  await h.gotoUrl(FRONTEND + '/room/' + ROOM, { waitUntil: 'networkidle' });
  await sleep(4000);

  // Dismiss in-room onboarding if any
  await h.js(clickByText + `('let\\'s play')`).catch(() => {});
  await sleep(1500);
  await h.js(clickByText + `('close')`).catch(() => {});
  await sleep(2500);

  // Check for "Reconnecting…" (the old bug symptom)
  s = await snapText();
  const reconnecting = /reconnect/i.test(s);
  results.steps.push({
    step: 'reconnectCheck',
    reconnecting,
    hasBoard: /tile|beat|genre|3-in|grid/i.test(s),
  });

  // Board check — count tile-like elements
  const boardSnap = await snapText();
  const tileCount = (boardSnap.match(/tile|beat-|grid|genre|bingo/gi) || []).length;
  results.steps.push({
    step: 'boardCheck',
    tileMatches: tileCount,
    hasBoard: tileCount >= 3,
    excerpt: boardSnap.slice(0, 500),
  });

  const boardShot =
    '/Users/brandonbennett/sound-royale-ny/dogfood-output/screenshots/step6-board.png';
  await h.captureScreenshot(boardShot);
  results.steps.push({ step: 'boardScreenshot', path: boardShot });

  // Beat upload (#104): find file input
  const fileInput = await h.waitForElement({ css: 'input[type=file]' }, 6000).catch(() => null);
  let upload = 'no-file-input';
  if (fileInput) {
    try {
      await h.uploadFile(fileInput, BEAT);
      await sleep(4500);
      upload = 'uploaded';
    } catch (e) {
      upload = 'error: ' + e.message;
    }
  }
  results.steps.push({ step: 'beatUpload', result: upload });

  const finalSnap = await snapText();
  results.steps.push({
    step: 'final',
    reconnecting: /reconnect/i.test(finalSnap),
    url: await h.js('location.href'),
    excerpt: finalSnap.slice(0, 400),
  });

  console.log(JSON.stringify(results, null, 2));
  await ego.completeTaskSpace();
})().catch((e) => {
  console.error('SWEEP ERROR:', e.message);
  process.exit(1);
});
