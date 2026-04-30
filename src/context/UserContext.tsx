import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { Player } from '@/types/game';
import { authApi, VerifiedUser } from '@/services/api';

interface UserSession {
  playerName: string | null;
  playerId: string | null;
  playerSecret: string | null;
  isSpectator: boolean;
  isAuthenticated: boolean;
  verifiedUser: VerifiedUser | null;
  authLoading: boolean;
}

interface UserContextType {
  userSession: UserSession;
  setPlayerName: (name: string) => void;
  setPlayerCredentials: (id: string, secret: string) => void;
  setSpectatorMode: (isSpectator: boolean) => void;
  clearSession: () => void;
  refreshVerifiedUser: () => Promise<void>;
  requestLoginCode: (email: string) => Promise<void>;
  verifyLoginCode: (email: string, code: string, displayName?: string) => Promise<VerifiedUser>;
  logoutVerifiedUser: () => Promise<void>;
  isAuthenticated: boolean;
  isHost: (players: Player[]) => boolean;
}

const initialSession: UserSession = {
  playerName: null,
  playerId: null,
  playerSecret: null,
  isSpectator: false,
  isAuthenticated: false,
  verifiedUser: null,
  authLoading: true,
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

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const [userSession, setUserSession] = useState<UserSession>(() => {
    const playerName = safeLocalStorage.getItem('playerName');
    const playerId = safeLocalStorage.getItem('playerId');
    const playerSecret = safeLocalStorage.getItem('playerSecret');
    const storedIsSpectator = safeLocalStorage.getItem('isSpectator');
    const stored = safeLocalStorage.getItem('userSession');
    let isSpectator = storedIsSpectator === 'true';
    if (stored) {
      try {
        const session = JSON.parse(stored);
        isSpectator = session.isSpectator ?? isSpectator;
      } catch {
        // ignore parse errors
      }
    }
    
    return {
      playerName,
      playerId,
      playerSecret,
      isSpectator,
      isAuthenticated: !!(playerId && playerSecret),
      verifiedUser: null,
      authLoading: true,
    };
  });

  const refreshVerifiedUser = async () => {
    setUserSession(prev => ({ ...prev, authLoading: true }));
    try {
      const { user } = await authApi.me();
      setUserSession(prev => ({ ...prev, verifiedUser: user, authLoading: false }));
    } catch {
      setUserSession(prev => ({ ...prev, verifiedUser: null, authLoading: false }));
    }
  };

  useEffect(() => {
    refreshVerifiedUser();
  }, []);

  useEffect(() => {
    if (userSession.playerName) {
      safeLocalStorage.setItem('playerName', userSession.playerName);
    } else {
      safeLocalStorage.removeItem('playerName');
    }
  }, [userSession.playerName]);

  useEffect(() => {
    if (userSession.playerId) {
      safeLocalStorage.setItem('playerId', userSession.playerId);
    } else {
      safeLocalStorage.removeItem('playerId');
    }
  }, [userSession.playerId]);

  useEffect(() => {
    if (userSession.playerSecret) {
      safeLocalStorage.setItem('playerSecret', userSession.playerSecret);
    } else {
      safeLocalStorage.removeItem('playerSecret');
    }
  }, [userSession.playerSecret]);

  useEffect(() => {
    safeLocalStorage.setItem('isSpectator', String(userSession.isSpectator));
  }, [userSession.isSpectator]);

  const setPlayerName = (name: string) => {
    setUserSession(prev => ({ ...prev, playerName: name?.trim() || null }));
  };

  const setPlayerCredentials = (id: string, secret: string) => {
    setUserSession(prev => ({
      ...prev,
      playerId: id,
      playerSecret: secret,
      isAuthenticated: true,
    }));
  };

  const setSpectatorMode = (isSpectator: boolean) => {
    setUserSession(prev => ({ ...prev, isSpectator }));
  };

  const clearSession = () => {
    setUserSession(prev => ({
      ...initialSession,
      verifiedUser: prev.verifiedUser,
      authLoading: false,
    }));
    safeLocalStorage.removeItem('playerName');
    safeLocalStorage.removeItem('playerId');
    safeLocalStorage.removeItem('playerSecret');
    safeLocalStorage.removeItem('isSpectator');
  };

  const requestLoginCode = async (email: string) => {
    await authApi.requestCode(email);
  };

  const verifyLoginCode = async (email: string, code: string, displayName?: string) => {
    const user = await authApi.verifyCode(email, code, displayName);
    setUserSession(prev => ({
      ...prev,
      verifiedUser: user,
      playerName: user.display_name,
      authLoading: false,
    }));
    return user;
  };

  const logoutVerifiedUser = async () => {
    await authApi.logout();
    setUserSession(prev => ({ ...prev, verifiedUser: null, authLoading: false }));
  };

  const isHost = (players: Player[]): boolean => {
    if (!userSession.playerId) return false;

    const currentPlayer = players.find(p => p.id === userSession.playerId);
    return currentPlayer?.isHost ?? false;
  };

  return (
    <UserContext.Provider value={{
      userSession,
      setPlayerName,
      setPlayerCredentials,
      setSpectatorMode,
      clearSession,
      refreshVerifiedUser,
      requestLoginCode,
      verifyLoginCode,
      logoutVerifiedUser,
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
