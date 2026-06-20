import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { UserProvider, useUser } from '../UserContext';

// Mock the api module for token functions
vi.mock('@/services/api', () => ({
  storeTokens: vi.fn(),
  clearStoredTokens: vi.fn(),
  getStoredAccessToken: vi.fn(() => null),
  getStoredRefreshToken: vi.fn(() => null),
}));

function TestConsumer() {
  const ctx = useUser();
  return (
    <div>
      <div data-testid="room-code">{ctx.userSession.roomCode ?? 'null'}</div>
      <div data-testid="player-name">{ctx.userSession.playerName ?? 'null'}</div>
      <div data-testid="player-id">{ctx.userSession.playerId ?? 'null'}</div>
      <div data-testid="is-auth">{String(ctx.isAuthenticated)}</div>
      <div data-testid="is-spectator">{String(ctx.userSession.isSpectator)}</div>
      <div data-testid="is-host">{String(ctx.userSession.isHost)}</div>
      <div data-testid="has-access-token">{String(ctx.userSession.accessToken !== null)}</div>
      <button data-testid="set-name" onClick={() => ctx.setPlayerName('Alice')} />
      <button
        data-testid="set-creds"
        onClick={() => ctx.setPlayerCredentials('id-1', 'secret-1')}
      />
      <button data-testid="set-spectator" onClick={() => ctx.setSpectatorMode(true)} />
      <button data-testid="clear" onClick={() => ctx.clearSession()} />
      <button data-testid="store-tokens" onClick={() => ctx.storeTokens('access-1', 'refresh-1')} />
      <button data-testid="clear-tokens" onClick={() => ctx.clearTokens()} />
    </div>
  );
}

describe('UserContext', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('provides default initial state', () => {
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    expect(screen.getByTestId('room-code').textContent).toBe('null');
    expect(screen.getByTestId('player-name').textContent).toBe('null');
    expect(screen.getByTestId('is-auth').textContent).toBe('true'); // anonymous session auto-created
  });

  it('setPlayerName updates player name', () => {
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    act(() => {
      screen.getByTestId('set-name').click();
    });

    expect(screen.getByTestId('player-name').textContent).toBe('Alice');
  });

  it('setPlayerCredentials updates player id and secret', () => {
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    act(() => {
      screen.getByTestId('set-creds').click();
    });

    expect(screen.getByTestId('player-id').textContent).toBe('id-1');
    expect(screen.getByTestId('is-auth').textContent).toBe('true');
  });

  it('setSpectatorMode toggles spectator flag', () => {
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    expect(screen.getByTestId('is-spectator').textContent).toBe('false');

    act(() => {
      screen.getByTestId('set-spectator').click();
    });

    expect(screen.getByTestId('is-spectator').textContent).toBe('true');
  });

  it('clearSession resets all state', () => {
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    act(() => {
      screen.getByTestId('set-name').click();
    });
    expect(screen.getByTestId('player-name').textContent).toBe('Alice');

    act(() => {
      screen.getByTestId('clear').click();
    });

    expect(screen.getByTestId('player-name').textContent).toBe('null');
    expect(screen.getByTestId('room-code').textContent).toBe('null');
  });

  it('storeTokens updates token state', () => {
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    act(() => {
      screen.getByTestId('store-tokens').click();
    });

    expect(screen.getByTestId('has-access-token').textContent).toBe('true');
  });

  it('clearTokens removes token state', () => {
    render(
      <UserProvider>
        <TestConsumer />
      </UserProvider>,
    );

    act(() => {
      screen.getByTestId('store-tokens').click();
    });
    expect(screen.getByTestId('has-access-token').textContent).toBe('true');

    act(() => {
      screen.getByTestId('clear-tokens').click();
    });
    expect(screen.getByTestId('has-access-token').textContent).toBe('false');
  });
});
