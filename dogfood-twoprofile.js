// Step 7: two-producer realtime — host + player2 both connect to same room
const FRONTEND = 'https://soundroyale.pages.dev';
const fs = require('fs');
const C = JSON.parse(fs.readFileSync('/tmp/sr_two.json', 'utf8'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickByText = `(function(needle){const els=[...document.querySelectorAll('button,a,[role=button],input')];const el=els.find(x=>(x.textContent||x.value||'').trim().toLowerCase().includes(needle.toLowerCase()));if(el){el.click();return true;}return false;})`;

async function openProfile(label, pid, psec, room) {
  const ts = await ego.createTaskSpace('sr-2p-' + label + '-' + Date.now());
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
  await sleep(2500);
  const final = await snap();
  await h.captureScreenshot(
    '/Users/brandonbennett/sound-royale-ny/dogfood-output/screenshots/step7-' + label + '.png',
  );
  await ego.completeTaskSpace();
  return {
    label,
    reconnecting: /reconnect/i.test(final),
    hasBoard: /tile|beat|genre|round|live/i.test(final),
    excerpt: final.slice(0, 200),
  };
}

(async () => {
  const host = await openProfile('HostP', C.host_id, C.host_secret, C.room_code);
  const p2 = await openProfile('Player2', C.p2_id, C.p2_secret, C.room_code);
  console.log(JSON.stringify({ host, p2 }, null, 2));
})().catch((e) => {
  console.error('ERR:', e.message);
  process.exit(1);
});
