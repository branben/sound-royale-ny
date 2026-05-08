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

export function createDiscordSessionFromLinkResponse(response: DiscordLinkResponse): DiscordSession {
  return {
    discordUserId: response.discord_user_id,
    sessionSecret: response.discord_session_secret,
    username: response.discord_username,
    avatarUrl: response.discord_avatar_url,
    linkedAt: response.linked_at,
  };
}
