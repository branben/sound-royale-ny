import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
page.on('console', msg => console.log('CONSOLE:', msg.type(), msg.text()));
page.on('pageerror', err => console.log('PAGE_ERROR:', err.message));
await page.goto('http://localhost:8080', { waitUntil: 'networkidle', timeout: 30000 });
console.log('URL:', page.url());
await page.screenshot({ path: '/tmp/debug-homepage.png', fullPage: true });
console.log('Homepage screenshot saved');

// Try creating room via API
const axios = (await import('axios')).default;
const createRes = await axios.post('http://localhost:8000/api/rooms/', {
  name: 'DebugTest',
  max_players: 2,
}, {
  headers: { 'Content-Type': 'application/json' }
});
const room = createRes.data;
console.log('Room created:', room.room_code, 'player_id:', room.player_id);

// Setup session and navigate
const sessionKey = `${room.room_code}:${room.player_id}`;
await page.addInitScript((s) => {
  localStorage.setItem('soundRoyaleSessions', JSON.stringify({
    [s.sessionKey]: {
      roomCode: s.roomCode,
      playerName: 'DebugHost',
      playerId: s.playerId,
      playerSecret: s.playerSecret,
      isSpectator: false,
    },
  }));
  sessionStorage.setItem('soundRoyaleActiveSessionKey', s.sessionKey);
}, { roomCode: room.room_code, playerId: room.player_id, playerSecret: room.player_secret, sessionKey });

await page.goto(`http://localhost:8080/room/${room.room_code}`, { waitUntil: 'networkidle', timeout: 30000 });
console.log('Room page URL:', page.url());
await page.screenshot({ path: '/tmp/debug-roompage.png', fullPage: true });
console.log('Room page screenshot saved');

// Check what's in the DOM
await page.waitForTimeout(3000); // let React settle

// Check for lobby element
const lobbyEl = await page.$('[data-testid="lobby"]');
if (lobbyEl) {
  console.log('LOBBY: Found!');
} else {
  console.log('LOBBY: NOT FOUND');
}

// Check for any errors in body
const hasError = await page.evaluate(() => document.body.innerText.includes('Maximum update depth exceeded'));
console.log('ERROR_DETECTED:', hasError);

const html = await page.evaluate(() => document.body.innerHTML.substring(0, 8000));
console.log('BODY HTML:', html);

await browser.close();
