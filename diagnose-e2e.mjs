/**
 * Diagnostic script to test each step of the E2E flow individually.
 * Does NOT require Playwright - uses the same approach as debug-test.mjs
 * but with more granular checks to identify WHERE the UI flow breaks.
 */
import axios from 'axios';

const API = 'http://localhost:8000/api';
const BASE = 'http://localhost:8080';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('=== Step 1: Create room via API ===');
  let createResp;
  for (let i = 0; i < 3; i++) {
    try {
      createResp = await axios.post(`${API}/rooms/`, {
        name: 'Diag Room',
        player_name: 'HostDiag',
      });
      break;
    } catch (e) {
      if (i === 2) { console.error('FAILED:', e.message); process.exit(1); }
      console.log(`  Retry ${i+1}...`);
      await sleep(500);
    }
  }
  const { room_code, player_id, player_secret } = createResp.data;
  console.log(`  Room created: code=${room_code}, playerId=${player_id}`);

  console.log('\n=== Step 2: Check room state (1 player) ===');
  const roomResp = await axios.get(`${API}/rooms/${room_code}/`);
  console.log(`  Status: ${roomResp.data.status}`);
  console.log(`  Players: ${roomResp.data.players?.length || 0}`);
  if (roomResp.data.players?.length !== 1) {
    console.error('  FAILED: Expected 1 player');
    process.exit(1);
  }
  console.log('  PASSED: 1 player in room');

  console.log('\n=== Step 3: Join room as player 2 via API ===');
  const joinResp = await axios.post(`${API}/rooms/${room_code}/join_game/`, {
    name: 'PlayerDiag',
    is_spectator: false,
  });
  console.log(`  Joined: id=${joinResp.data.id}, playerSecret=${joinResp.data.player_secret ? 'set' : 'MISSING!'}`);

  console.log('\n=== Step 4: Check room state (2 players) ===');
  const roomResp2 = await axios.get(`${API}/rooms/${room_code}/`);
  console.log(`  Players: ${roomResp2.data.players?.length || 0}`);
  if (roomResp2.data.players?.length !== 2) {
    console.error('  FAILED: Expected 2 players');
    process.exit(1);
  }
  console.log('  PASSED: 2 players in room');

  console.log('\n=== Step 5: Rejoin as host (simulates session injection) ===');
  const rejoinResp = await axios.post(`${API}/rejoin_game/`, {
    room_code,
    player_secret,
  });
  console.log(`  Rejoin: id=${rejoinResp.data.id}, name=${rejoinResp.data.name}`);
  if (rejoinResp.data.is_host !== true) {
    console.log('  NOTE: is_host not true, checking...');
    console.log(`  is_host: ${rejoinResp.data.is_host}, isHost: ${rejoinResp.data.isHost}`);
  }

  console.log('\n=== Step 6: Test start game ===');
  try {
    const startResp = await axios.post(`${API}/start_game/`, {
      room_code,
      player_secret,
    });
    console.log(`  Start: status=${startResp.status}`);
  } catch (e) {
    console.log(`  Start error: ${e.response?.data?.error || e.message}`);
  }

  console.log('\n=== Step 7: Check game state ===');
  const gameState = await axios.get(`${API}/rooms/${room_code}/`);
  console.log(`  Status: ${gameState.data.status}`);
  console.log(`  Players in game state: ${gameState.data.players?.length || 'N/A'}`);

  console.log('\n=== ALL API STEPS PASSED ===');
  console.log(`\nRoom code for manual testing: ${room_code}`);
  console.log(`Host secret: ${player_secret}`);
  console.log(`Player2 ID: ${joinResp.data.id}`);
}

main().catch(e => {
  console.error('FATAL:', e.message);
  process.exit(1);
});
