import { afterEach, describe, expect, it } from 'vitest';
import {
  clearDiscordSession,
  createDiscordSessionFromLinkResponse,
  getDiscordSession,
  saveDiscordSession,
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
