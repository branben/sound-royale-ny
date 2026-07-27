// Step 7b: drive beat uploads from both producers to complete tiles (bingo prereq)
const FRONTEND = 'https://soundroyale.pages.dev';
const BEAT = '/Users/brandonbennett/sound-royale-ny/.verify_beat.wav';
const fs = require('fs');
const C = JSON.parse(fs.readFileSync('/tmp/sr_two.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickByText = `(function(needle){const els=[...document.querySelectorAll('button,a,[role=button],input')];const el=els.find(x=>(x.textContent||x.value||'').trim().toLowerCase().includes(needle.toLowerCase()));if(el){el.click();return true;}return false;})`;

async function uploadAs(label, pid, psec, room) {
  const ts = await ego.createTaskSpace('sr-up-' + label + '-' + Date.now());
  await ego.useTaskSpace(ts.id);
  const h = ego.helpers;
  const snap = async () => {
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
  let s = await snap();
  if (s.includes('Let') && s.includes('Play')) {
    await h.js(clickByText + `('close')`);
    await sleep(1200);
  }
  await h.js(
    `localStorage.setItem('playerId','${pid}');localStorage.setItem('playerSecret','${psec}');localStorage.setItem('playerName','${label}');localStorage.setItem('lastRoomCode','${room}');`,
  );
  await h.gotoUrl(FRONTEND + '/room/' + room, { waitUntil: 'networkidle' });
  await sleep(4000);
  await h.js(clickByText + `('let\\'s play')`).catch(() => {});
  await sleep(1200);
  await h.js(clickByText + `('close')`).catch(() => {});
  await sleep(2000);
  // dismiss "Your Turn" popup
  await h.js(clickByText + `('next')`).catch(() => {});
  await sleep(2000);
  // click current genre tile to open upload drawer
  const tile = await h.js(
    `(()=>{const t=[...document.querySelectorAll('button,[role=button]')].find(z=>(z.textContent||'').match(/trap|phonk|house|edm|lo-fi|jazz|ambient|r&b|hip-hop|techno|rock/i));if(t){t.click();return (t.textContent||'').trim().slice(0,15);}return false;})()`,
  );
  await sleep(3000);
  // find file input (opacity-0 dropzone)
  let uploaded = 'no-input';
  const fi =
    (await h.waitForElement({ css: 'input[type="file"][accept]' }, 8000).catch(() => null)) ||
    (await h.js(`document.querySelector('input[type=file]')`));
  if (fi) {
    try {
      await h.uploadFile(fi, BEAT);
      await sleep(4500);
      uploaded = 'uploaded';
    } catch (e) {
      uploaded = 'err:' + e.message;
    }
  }
  await ego.completeTaskSpace();
  return { label, tileClicked: tile, uploaded };
}

(async () => {
  const r1 = await uploadAs('HostP', C.host_id, C.host_secret, C.room_code);
  // start a fresh round so player2 gets a turn if needed
  const r2 = await uploadAs('Player2', C.p2_id, C.p2_secret, C.room_code);
  console.log(JSON.stringify({ r1, r2 }, null, 2));
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
