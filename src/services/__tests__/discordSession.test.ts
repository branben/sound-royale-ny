import { afterEach, describe, expect, it } from 'vitest';
import {
  clearDiscordSession,
  clearDiscordOAuthState,
  createDiscordSessionFromLinkResponse,
  getDiscordSession,
  getDiscordOAuthState,
  saveDiscordSession,
  saveDiscordOAuthState,
} from '../discordSession';

describe('Discord session storage', () => {
  afterEach(() => {
    localStorage.clear();
  });

  it('persists a stable Discord session outside room player sessions', () => {
    saveDiscordSession({
      discordUserId: 'discord-123',
      sessionSecret: 'session-secret',
      username: 'verified_user',
      avatarUrl: 'https://cdn.discordapp.com/avatar.png',
      linkedAt: '2026-05-08T18:00:00Z',
    });

    expect(getDiscordSession()).toEqual({
      discordUserId: 'discord-123',
      sessionSecret: 'session-secret',
      username: 'verified_user',
      avatarUrl: 'https://cdn.discordapp.com/avatar.png',
      linkedAt: '2026-05-08T18:00:00Z',
    });
  });

  it('clears the local Discord session without touching room sessions', () => {
    localStorage.setItem('soundRoyaleSessions', JSON.stringify({ existing: true }));
    saveDiscordSession({
      discordUserId: 'discord-456',
      sessionSecret: 'session-secret',
      username: 'verified_user',
    });

    clearDiscordSession();

    expect(getDiscordSession()).toBeNull();
    expect(localStorage.getItem('soundRoyaleSessions')).toBe(JSON.stringify({ existing: true }));
  });

  it('ignores malformed stored sessions', () => {
    localStorage.setItem('soundRoyaleDiscordSession', JSON.stringify({
      discordUserId: 'discord-789',
      username: 'missing-secret',
    }));

    expect(getDiscordSession()).toBeNull();
  });

  it('converts a Discord link response into local stable session data', () => {
    expect(createDiscordSessionFromLinkResponse({
      discord_user_id: 'discord-123',
      discord_session_secret: 'session-secret',
      discord_username: 'verified_user',
      discord_avatar_url: 'https://cdn.discordapp.com/avatar.png',
      linked_at: '2026-05-08T18:00:00Z',
    })).toEqual({
      discordUserId: 'discord-123',
      sessionSecret: 'session-secret',
      username: 'verified_user',
      avatarUrl: 'https://cdn.discordapp.com/avatar.png',
      linkedAt: '2026-05-08T18:00:00Z',
    });
  });
});

describe('Discord OAuth flow state', () => {
  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('persists OAuth state to localStorage so it survives HMR reload', () => {
    saveDiscordOAuthState('oauth-state-abc', 'player-1', 'secret-xyz');
    sessionStorage.clear();

    const result = getDiscordOAuthState();
    expect(result).toEqual({
      state: 'oauth-state-abc',
      playerId: 'player-1',
      playerSecret: 'secret-xyz',
    });
  });

  it('reads from sessionStorage when available (happy path)', () => {
    saveDiscordOAuthState('oauth-state-abc', 'player-1', 'secret-xyz');

    const result = getDiscordOAuthState();
    expect(result).toEqual({
      state: 'oauth-state-abc',
      playerId: 'player-1',
      playerSecret: 'secret-xyz',
    });
  });

  it('returns null when no OAuth state exists', () => {
    expect(getDiscordOAuthState()).toBeNull();
  });

  it('clears OAuth state from both stores', () => {
    saveDiscordOAuthState('oauth-state-abc', 'player-1', 'secret-xyz');
    clearDiscordOAuthState();

    expect(getDiscordOAuthState()).toBeNull();
  });

  it('returns null for expired OAuth state', () => {
    const elapsed = 11 * 60 * 1000;
    const expiredPayload = JSON.stringify({
      state: 'old-state',
      savedAt: Date.now() - elapsed,
    });
    localStorage.setItem('soundRoyaleDiscordOAuthState', expiredPayload);
    localStorage.setItem('soundRoyaleDiscordOAuthPlayerId', 'player-1');
    localStorage.setItem('soundRoyaleDiscordOAuthPlayerSecret', 'secret-xyz');

    expect(getDiscordOAuthState()).toBeNull();
  });

  it('returns valid OAuth state within TTL window', () => {
    const savedAt = Date.now() - 5 * 60 * 1000;
    const freshPayload = JSON.stringify({ state: 'fresh-state', savedAt });
    localStorage.setItem('soundRoyaleDiscordOAuthState', freshPayload);
    localStorage.setItem('soundRoyaleDiscordOAuthPlayerId', 'player-1');
    localStorage.setItem('soundRoyaleDiscordOAuthPlayerSecret', 'secret-xyz');

    const result = getDiscordOAuthState();
    expect(result).toEqual({
      state: 'fresh-state',
      playerId: 'player-1',
      playerSecret: 'secret-xyz',
    });
  });

  it('does not clear the Discord session when clearing OAuth state', () => {
    saveDiscordSession({
      discordUserId: 'discord-123',
      sessionSecret: 'session-secret',
      username: 'verified_user',
    });
    saveDiscordOAuthState('oauth-state', 'player-1', 'secret-xyz');
    clearDiscordOAuthState();

    expect(getDiscordSession()).not.toBeNull();
    expect(getDiscordSession()!.discordUserId).toBe('discord-123');
  });
});
