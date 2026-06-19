export interface DiscordSession {
  discordUserId: string;
  sessionSecret: string;
  username: string;
  avatarUrl?: string;
  linkedAt?: string;
}

export interface DiscordLinkResponse {
  discord_user_id: string;
  discord_session_secret: string;
  discord_username: string;
  discord_avatar_url?: string;
  linked_at?: string;
}

const DISCORD_SESSION_KEY = 'soundRoyaleDiscordSession';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isDiscordSession(value: unknown): value is DiscordSession {
  if (!isRecord(value)) return false;

  return (
    typeof value.discordUserId === 'string' &&
    typeof value.sessionSecret === 'string' &&
    typeof value.username === 'string' &&
    (value.avatarUrl === undefined || typeof value.avatarUrl === 'string') &&
    (value.linkedAt === undefined || typeof value.linkedAt === 'string')
  );
}

export function getDiscordSession(): DiscordSession | null {
  try {
    const raw = localStorage.getItem(DISCORD_SESSION_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    return isDiscordSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function saveDiscordSession(session: DiscordSession): void {
  localStorage.setItem(DISCORD_SESSION_KEY, JSON.stringify(session));
}

export function clearDiscordSession(): void {
  localStorage.removeItem(DISCORD_SESSION_KEY);
}

export function createDiscordSessionFromLinkResponse(
  response: DiscordLinkResponse,
): DiscordSession {
  return {
    discordUserId: response.discord_user_id,
    sessionSecret: response.discord_session_secret,
    username: response.discord_username,
    avatarUrl: response.discord_avatar_url,
    linkedAt: response.linked_at,
  };
}

// OAuth flow state (short-lived, survives HMR / new tab / restart)

const OAUTH_STATE_KEY = 'soundRoyaleDiscordOAuthState';
const OAUTH_PLAYER_ID_KEY = 'soundRoyaleDiscordOAuthPlayerId';
const OAUTH_PLAYER_SECRET_KEY = 'soundRoyaleDiscordOAuthPlayerSecret';
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

interface OAuthStoredState {
  state: string;
  savedAt: number;
}

function isOAuthStoredState(value: unknown): value is OAuthStoredState {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const v = value as Record<string, unknown>;
  return typeof v.state === 'string' && typeof v.savedAt === 'number';
}

export interface DiscordOAuthState {
  state: string;
  playerId: string;
  playerSecret: string;
}

export function saveDiscordOAuthState(state: string, playerId: string, playerSecret: string): void {
  const payload: OAuthStoredState = { state, savedAt: Date.now() };
  localStorage.setItem(OAUTH_STATE_KEY, JSON.stringify(payload));
  localStorage.setItem(OAUTH_PLAYER_ID_KEY, playerId);
  localStorage.setItem(OAUTH_PLAYER_SECRET_KEY, playerSecret);
  // Also keep sessionStorage as a fast-path for the default happy flow
  try {
    sessionStorage.setItem('discord_oauth_state', state);
    sessionStorage.setItem('discord_player_id', playerId);
    sessionStorage.setItem('discord_player_secret', playerSecret);
  } catch {
    // sessionStorage may be unavailable in some contexts
  }
}

export function getDiscordOAuthState(): DiscordOAuthState | null {
  // Try localStorage first (survives HMR); fall back to sessionStorage
  const read = (storage: Storage): DiscordOAuthState | null => {
    try {
      const stateRaw =
        storage.getItem(OAUTH_STATE_KEY) ??
        (storage === sessionStorage ? storage.getItem('discord_oauth_state') : null);
      const playerId =
        storage.getItem(OAUTH_PLAYER_ID_KEY) ??
        (storage === sessionStorage ? storage.getItem('discord_player_id') : null);
      const playerSecret =
        storage.getItem(OAUTH_PLAYER_SECRET_KEY) ??
        (storage === sessionStorage ? storage.getItem('discord_player_secret') : null);

      if (!stateRaw || !playerId || !playerSecret) return null;

      // For localStorage entries, the state is wrapped as JSON {state, savedAt}
      // Extract the actual state value and enforce TTL
      if (storage === localStorage) {
        const parsed: unknown = JSON.parse(stateRaw);
        if (isOAuthStoredState(parsed)) {
          if (Date.now() - parsed.savedAt > OAUTH_STATE_TTL_MS) {
            return null; // expired
          }
          return { state: parsed.state, playerId, playerSecret };
        }
        // If it's not a wrapped state, treat the raw string as the state
        return { state: stateRaw, playerId, playerSecret };
      }

      // sessionStorage: stateRaw is the plain state string
      return { state: stateRaw, playerId, playerSecret };
    } catch {
      return null;
    }
  };

  return read(localStorage) ?? read(sessionStorage);
}

export function clearDiscordOAuthState(): void {
  localStorage.removeItem(OAUTH_STATE_KEY);
  localStorage.removeItem(OAUTH_PLAYER_ID_KEY);
  localStorage.removeItem(OAUTH_PLAYER_SECRET_KEY);
  try {
    sessionStorage.removeItem('discord_oauth_state');
    sessionStorage.removeItem('discord_player_id');
    sessionStorage.removeItem('discord_player_secret');
  } catch {
    // ignore
  }
}
