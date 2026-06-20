import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  ReactNode,
  useEffect,
  useRef,
} from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Player } from '@/types/game';
import {
  storeTokens,
  clearStoredTokens,
  getStoredAccessToken,
  getStoredRefreshToken,
} from '@/services/api';

interface VerifiedUser {
  id: string;
  email: string;
  display_name: string;
}

interface UserSession {
  roomCode: string | null;
  playerName: string | null;
  playerId: string | null;
  playerSecret: string | null;
  isSpectator: boolean;
  isAuthenticated: boolean;
  isHost: boolean;
  verifiedUser?: VerifiedUser | null;
  accessToken?: string | null;
  refreshToken?: string | null;
}

interface RoomSessionInput {
  playerName: string;
  playerId: string;
  playerSecret: string;
  isSpectator: boolean;
  isHost?: boolean;
}

interface StoredRoomSession extends RoomSessionInput {
  roomCode: string;
  isHost?: boolean;
}

interface UserContextType {
  ensureAnonymousSession: () => void;
  userSession: UserSession;
  setPlayerName: (name: string) => void;
  setPlayerCredentials: (id: string, secret: string) => void;
  setSpectatorMode: (isSpectator: boolean) => void;
  setActiveRoomSession: (roomCode: string, session: RoomSessionInput) => void;
  clearSession: () => void;
  isAuthenticated: boolean;
  isHost: (players: Player[]) => boolean;
  setHostStatus: (isHost: boolean) => void;
  requestLoginCode: (email: string) => Promise<void>;
  verifyLoginCode: (email: string, code: string, displayName?: string) => Promise<void>;
  logoutVerifiedUser: () => void;
  storeTokens: (access: string, refresh: string) => void;
  clearTokens: () => void;
  getAccessToken: () => string | null;
  getRefreshToken: () => string | null;
}

const ROOM_SESSIONS_KEY = 'soundRoyaleSessions';
const ACTIVE_SESSION_KEY = 'soundRoyaleActiveSessionKey';
const LEGACY_USER_SESSION_KEY = 'userSession';
const LEGACY_KEYS = ['playerName', 'playerId', 'playerSecret', 'isSpectator'];

const initialSession: UserSession = {
  roomCode: null,
  playerName: null,
  playerId: null,
  playerSecret: null,
  isSpectator: false,
  isAuthenticated: false,
  isHost: false,
  accessToken: null,
  refreshToken: null,
};

const safeLocalStorage = {
  getItem: (key: string): string | null => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      localStorage.setItem(key, value);
    } catch (error) {
      console.warn('Failed to write to localStorage:', error);
    }
  },
  removeItem: (key: string): void => {
    try {
      localStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove from localStorage:', error);
    }
  },
};

const safeSessionStorage = {
  getItem: (key: string): string | null => {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  },
  setItem: (key: string, value: string): void => {
    try {
      sessionStorage.setItem(key, value);
    } catch (error) {
      console.warn('Failed to write to sessionStorage:', error);
    }
  },
  removeItem: (key: string): void => {
    try {
      sessionStorage.removeItem(key);
    } catch (error) {
      console.warn('Failed to remove from sessionStorage:', error);
    }
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredRoomSession(value: unknown): value is StoredRoomSession {
  if (!isRecord(value)) return false;
  return (
    typeof value.roomCode === 'string' &&
    typeof value.playerName === 'string' &&
    typeof value.playerId === 'string' &&
    typeof value.playerSecret === 'string' &&
    typeof value.isSpectator === 'boolean' &&
    (value.isHost === undefined || typeof value.isHost === 'boolean')
  );
}

function toUserSession(session: StoredRoomSession): UserSession {
  return {
    roomCode: session.roomCode,
    playerName: session.playerName,
    playerId: session.playerId,
    playerSecret: session.playerSecret,
    isSpectator: session.isSpectator,
    isAuthenticated: true,
    isHost: session.isHost === true,
  };
}

function getSessionKey(roomCode: string, playerId: string): string {
  return `${roomCode}:${playerId}`;
}

function readStoredSessions(): Record<string, StoredRoomSession> {
  const raw = safeLocalStorage.getItem(ROOM_SESSIONS_KEY);
  if (!raw) return {};

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return {};

    return Object.entries(parsed).reduce<Record<string, StoredRoomSession>>((acc, [key, value]) => {
      if (isStoredRoomSession(value)) {
        acc[key] = value;
      }
      return acc;
    }, {});
  } catch {
    return {};
  }
}

function writeStoredSessions(sessions: Record<string, StoredRoomSession>): void {
  safeLocalStorage.setItem(ROOM_SESSIONS_KEY, JSON.stringify(sessions));
}

function clearLegacySessionKeys(): void {
  LEGACY_KEYS.forEach((key) => safeLocalStorage.removeItem(key));
  safeLocalStorage.removeItem(LEGACY_USER_SESSION_KEY);
}

function readLegacySession(): UserSession {
  const playerName = safeLocalStorage.getItem('playerName');
  const playerId = safeLocalStorage.getItem('playerId');
  const playerSecret = safeLocalStorage.getItem('playerSecret');
  const storedSpectatorMode = safeLocalStorage.getItem('isSpectator');
  const stored = safeLocalStorage.getItem(LEGACY_USER_SESSION_KEY);
  let isSpectator = storedSpectatorMode === 'true';

  if (stored) {
    try {
      const parsed: unknown = JSON.parse(stored);
      if (isRecord(parsed) && typeof parsed.isSpectator === 'boolean') {
        isSpectator = parsed.isSpectator;
      }
    } catch {
      // ignore malformed legacy session data
    }
  }

  return {
    roomCode: null,
    playerName,
    playerId,
    playerSecret,
    isSpectator,
    isAuthenticated: Boolean(playerId && playerSecret),
    isHost: false,
  };
}

function readInitialSession(): UserSession {
  const activeSessionKey = safeSessionStorage.getItem(ACTIVE_SESSION_KEY);
  if (activeSessionKey) {
    const activeSession = readStoredSessions()[activeSessionKey];
    if (activeSession) {
      return toUserSession(activeSession);
    }
    safeSessionStorage.removeItem(ACTIVE_SESSION_KEY);
  }

  return readLegacySession();
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userSession, setUserSession] = useState<UserSession>(readInitialSession);
  const persistTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Ensure an anonymous player session exists on first load
  useEffect(() => {
    if (!userSession.playerId) {
      const id = uuidv4();
      const secret = uuidv4();
      setPlayerCredentials(id, secret);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Internal helper to generate and set anonymous credentials
  const createAnonymousSession = () => {
    const id = uuidv4();
    const secret = uuidv4();
    setPlayerCredentials(id, secret);
  };

  // Public helper to guarantee an anonymous session on demand
  const ensureAnonymousSession = () => {
    if (!userSession.playerId) {
      createAnonymousSession();
    }
  };

  const setActiveRoomSession = useCallback((roomCode: string, session: RoomSessionInput) => {
    const storedSession: StoredRoomSession = {
      roomCode,
      playerName: session.playerName.trim(),
      playerId: session.playerId,
      playerSecret: session.playerSecret,
      isSpectator: session.isSpectator,
      isHost: session.isHost,
    };
    const sessionKey = getSessionKey(roomCode, session.playerId);
    const sessions = readStoredSessions();
    sessions[sessionKey] = storedSession;
    writeStoredSessions(sessions);
    safeSessionStorage.setItem(ACTIVE_SESSION_KEY, sessionKey);
    clearLegacySessionKeys();
    setUserSession(toUserSession(storedSession));
  }, []);

  const persistActiveSession = (next: UserSession): void => {
    if (!next.playerId || !next.playerSecret || !next.playerName) {
      return;
    }

    if (persistTimeoutRef.current) {
      clearTimeout(persistTimeoutRef.current);
    }

    const roomCode = next.roomCode ?? '__ANON__';
    const playerId: string = next.playerId;
    const playerName: string = next.playerName;
    const playerSecret: string = next.playerSecret;
    const isSpectator = next.isSpectator;
    const isHost = next.isHost;

    persistTimeoutRef.current = setTimeout(() => {
      const sessionKey = getSessionKey(roomCode, playerId);
      const sessions = readStoredSessions();
      sessions[sessionKey] = {
        roomCode,
        playerName,
        playerId,
        playerSecret,
        isSpectator,
        isHost,
      };
      writeStoredSessions(sessions);
      safeSessionStorage.setItem(ACTIVE_SESSION_KEY, sessionKey);
      persistTimeoutRef.current = null;
    }, 100);
  };

  const setPlayerName = useCallback((name: string) => {
    setUserSession((prev) => {
      const next = { ...prev, playerName: name?.trim() || null };
      persistActiveSession(next);
      return next;
    });
  }, []);

  const setPlayerCredentials = useCallback((id: string, secret: string) => {
    setUserSession((prev) => {
      const next = {
        ...prev,
        playerId: id,
        playerSecret: secret,
        isAuthenticated: true,
      };
      persistActiveSession(next);
      return next;
    });
  }, []);

  const setSpectatorMode = useCallback((isSpectator: boolean) => {
    setUserSession((prev) => {
      const next = { ...prev, isSpectator };
      persistActiveSession(next);
      return next;
    });
  }, []);

  const clearSession = useCallback(() => {
    const activeSessionKey = safeSessionStorage.getItem(ACTIVE_SESSION_KEY);
    if (activeSessionKey) {
      const sessions = readStoredSessions();
      delete sessions[activeSessionKey];
      writeStoredSessions(sessions);
    }

    safeSessionStorage.removeItem(ACTIVE_SESSION_KEY);
    clearLegacySessionKeys();
    clearStoredTokens();
    setUserSession(initialSession);
  }, []);

  const setHostStatus = useCallback((isHost: boolean) => {
    setUserSession((prev) => {
      const next = { ...prev, isHost };
      persistActiveSession(next);
      return next;
    });
  }, []);

  const isHost = (players: Player[]): boolean => {
    // Primary: derive from server-provided players array
    if (players && players.length > 0) {
      const currentPlayer = players.find((p) => p.id === userSession.playerId);
      if (currentPlayer) {
        return currentPlayer.isHost === true;
      }
    }
    // Fallback: use session-stored host flag (survives page refresh before
    // gameState.players is repopulated)
    return userSession.isHost === true;
  };

  // TODO: Implement verified identity when backend API is ready
  const requestLoginCode = async (_email: string): Promise<void> => {
    throw new Error('Verified identity not yet implemented');
  };

  const verifyLoginCode = async (
    _email: string,
    _code: string,
    _displayName?: string,
  ): Promise<void> => {
    throw new Error('Verified identity not yet implemented');
  };

  const logoutVerifiedUser = (): void => {
    setUserSession((prev) => ({ ...prev, verifiedUser: null }));
  };

  const handleStoreTokens = useCallback((access: string, refresh: string) => {
    storeTokens(access, refresh);
    setUserSession((prev) => ({ ...prev, accessToken: access, refreshToken: refresh }));
  }, []);

  const handleClearTokens = useCallback(() => {
    clearStoredTokens();
    setUserSession((prev) => ({ ...prev, accessToken: null, refreshToken: null }));
  }, []);

  const handleGetAccessToken = useCallback((): string | null => {
    return getStoredAccessToken();
  }, []);

  const handleGetRefreshToken = useCallback((): string | null => {
    return getStoredRefreshToken();
  }, []);

  return (
    <UserContext.Provider
      value={{
        userSession,
        setPlayerName,
        setPlayerCredentials,
        setSpectatorMode,
        setActiveRoomSession,
        clearSession,
        ensureAnonymousSession,
        isAuthenticated: userSession.isAuthenticated,
        isHost,
        setHostStatus,
        requestLoginCode,
        verifyLoginCode,
        logoutVerifiedUser,
        storeTokens: handleStoreTokens,
        clearTokens: handleClearTokens,
        getAccessToken: handleGetAccessToken,
        getRefreshToken: handleGetRefreshToken,
      }}
    >
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
}

export function useUserSession() {
  const { userSession } = useUser();
  return userSession;
}
