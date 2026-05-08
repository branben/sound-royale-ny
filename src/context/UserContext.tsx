import React, { createContext, useContext, useState, ReactNode } from 'react';
import { Player } from '@/types/game';

interface UserSession {
  roomCode: string | null;
  playerName: string | null;
  playerId: string | null;
  playerSecret: string | null;
  isSpectator: boolean;
  isAuthenticated: boolean;
}

interface RoomSessionInput {
  playerName: string;
  playerId: string;
  playerSecret: string;
  isSpectator: boolean;
}

interface StoredRoomSession extends RoomSessionInput {
  roomCode: string;
}

interface UserContextType {
  userSession: UserSession;
  setPlayerName: (name: string) => void;
  setPlayerCredentials: (id: string, secret: string) => void;
  setSpectatorMode: (isSpectator: boolean) => void;
  setActiveRoomSession: (roomCode: string, session: RoomSessionInput) => void;
  clearSession: () => void;
  isAuthenticated: boolean;
  isHost: (players: Player[]) => boolean;
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
    typeof value.isSpectator === 'boolean'
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
  LEGACY_KEYS.forEach(key => safeLocalStorage.removeItem(key));
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

  const setActiveRoomSession = (roomCode: string, session: RoomSessionInput) => {
    const storedSession: StoredRoomSession = {
      roomCode,
      playerName: session.playerName.trim(),
      playerId: session.playerId,
      playerSecret: session.playerSecret,
      isSpectator: session.isSpectator,
    };
    const sessionKey = getSessionKey(roomCode, session.playerId);
    const sessions = readStoredSessions();
    sessions[sessionKey] = storedSession;
    writeStoredSessions(sessions);
    safeSessionStorage.setItem(ACTIVE_SESSION_KEY, sessionKey);
    clearLegacySessionKeys();
    setUserSession(toUserSession(storedSession));
  };

  const persistActiveSession = (next: UserSession): void => {
    if (!next.roomCode || !next.playerId || !next.playerSecret || !next.playerName) {
      return;
    }

    const sessionKey = getSessionKey(next.roomCode, next.playerId);
    const sessions = readStoredSessions();
    sessions[sessionKey] = {
      roomCode: next.roomCode,
      playerName: next.playerName,
      playerId: next.playerId,
      playerSecret: next.playerSecret,
      isSpectator: next.isSpectator,
    };
    writeStoredSessions(sessions);
    safeSessionStorage.setItem(ACTIVE_SESSION_KEY, sessionKey);
  };

  const setPlayerName = (name: string) => {
    setUserSession(prev => {
      const next = { ...prev, playerName: name?.trim() || null };
      persistActiveSession(next);
      return next;
    });
  };

  const setPlayerCredentials = (id: string, secret: string) => {
    setUserSession(prev => {
      const next = {
        ...prev,
        playerId: id,
        playerSecret: secret,
        isAuthenticated: true,
      };
      persistActiveSession(next);
      return next;
    });
  };

  const setSpectatorMode = (isSpectator: boolean) => {
    setUserSession(prev => {
      const next = { ...prev, isSpectator };
      persistActiveSession(next);
      return next;
    });
  };

  const clearSession = () => {
    const activeSessionKey = safeSessionStorage.getItem(ACTIVE_SESSION_KEY);
    if (activeSessionKey) {
      const sessions = readStoredSessions();
      delete sessions[activeSessionKey];
      writeStoredSessions(sessions);
    }

    safeSessionStorage.removeItem(ACTIVE_SESSION_KEY);
    clearLegacySessionKeys();
    setUserSession(initialSession);
  };

  const isHost = (players: Player[]): boolean => {
    if (!userSession.playerId) return false;
    
    return players.some(p => p.id === userSession.playerId && p.isHost === true);
  };

  return (
    <UserContext.Provider value={{
      userSession,
      setPlayerName,
      setPlayerCredentials,
      setSpectatorMode,
      setActiveRoomSession,
      clearSession,
      isAuthenticated: userSession.isAuthenticated,
      isHost,
    }}>
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
