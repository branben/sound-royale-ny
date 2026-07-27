// Step 6b: verify beat upload (#104) — click a tile, find file input
const FRONTEND = 'https://soundroyale.pages.dev';
const BEAT = '/Users/brandonbennett/sound-royale-ny/.verify_beat.wav';
const fs = require('fs');
const C = JSON.parse(fs.readFileSync('/tmp/sr_creds.json', 'utf8'));
const ROOM = C.room_code,
  PID = C.player_id,
  PSEC = C.player_secret;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickByText = `(function(needle){const els=[...document.querySelectorAll('button,a,[role=button],input')];const el=els.find(x=>(x.textContent||x.value||'').trim().toLowerCase().includes(needle.toLowerCase()));if(el){el.click();return true;}return false;})`;

(async () => {
  const ts = await ego.createTaskSpace('sr-upload-' + Date.now());
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

  await h.gotoUrl(FRONTEND, { waitUntil: 'networkidle' });
  await sleep(1500);
  await h.js(clickByText + `('let\\'s play')`).catch(() => {});
  await sleep(1200);
  let s = await snapText();
  if (s.includes('Let') && s.includes('Play')) {
    await h.js(clickByText + `('close')`);
    await sleep(1200);
  }
  await h.js(
    `localStorage.setItem('playerId','${PID}');localStorage.setItem('playerSecret','${PSEC}');localStorage.setItem('playerName','SmokeTest');localStorage.setItem('lastRoomCode','${ROOM}');`,
  );
  await h.gotoUrl(FRONTEND + '/room/' + ROOM, { waitUntil: 'networkidle' });
  await sleep(4000);
  await h.js(clickByText + `('let\\'s play')`).catch(() => {});
  await sleep(1200);
  await h.js(clickByText + `('close')`).catch(() => {});
  await sleep(2000);
  // Dismiss "Your Turn!" popup if present (click Next)
  await h.js(clickByText + `('next')`).catch(() => {});
  await sleep(2500);
  // Click the CURRENT genre tile (the one the toast names). Try Trap first, then any genre tile.
  const tileClicked = await h.js(`(()=>{
    const tiles=[...document.querySelectorAll('button,[role=button]')];
    const t=tiles.find(x=>(x.textContent||'').match(/\\btrap\\b|phonk|house|edm|lo-fi|hip-hop|techno|r&b|jazz|rock/i));
    if(t){t.click();return (t.textContent||'').trim().slice(0,20);}
    return false;
  })()`);
  results.steps.push({ step: 'tileClicked', tile: tileClicked });
  await sleep(3000);

  // Look for file input after tile click (it's opacity-0, absolute; match by accept attr)
  const fileInput = await h
    .waitForElement({ css: 'input[type="file"][accept]' }, 8000)
    .catch(() => null);
  results.steps.push({ step: 'fileInputAfterTile', found: !!fileInput });
  if (!fileInput) {
    // fallback: grab via JS and upload directly
    const fi = await h.js(`document.querySelector('input[type=file]')`);
    results.steps.push({ step: 'fileInputJS', found: !!fi });
  }

  let upload = 'no-file-input-after-tile';
  if (fileInput) {
    try {
      await h.uploadFile(fileInput, BEAT);
      await sleep(4500);
      upload = 'uploaded';
    } catch (e) {
      upload = 'error: ' + e.message;
    }
  } else {
    // try uploading via JS-selected input
    try {
      const fi2 = await h.js(`document.querySelector('input[type=file]')`);
      if (fi2) {
        await h.uploadFile(fi2, BEAT);
        await sleep(4500);
        upload = 'uploaded-via-js';
      }
    } catch (e) {
      upload = 'error2: ' + e.message;
    }
  }
  results.steps.push({ step: 'beatUpload', result: upload });

  const afterSnap = await snapText();
  results.steps.push({
    step: 'afterUpload',
    excerpt: afterSnap.slice(0, 400),
    reconnecting: /reconnect/i.test(afterSnap),
  });

  const shot = '/Users/brandonbennett/sound-royale-ny/dogfood-output/screenshots/step6-upload.png';
  await h.captureScreenshot(shot);
  results.steps.push({ step: 'screenshot', path: shot });

  console.log(JSON.stringify(results, null, 2));
  await ego.completeTaskSpace();
})().catch((e) => {
  console.error('SWEEP ERROR:', e.message);
  process.exit(1);
});
