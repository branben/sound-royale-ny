import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { JoinRoomForm } from '../JoinRoomForm';

describe('JoinRoomForm', () => {
  const defaultProps = {
    roomCode: '',
    isLoading: false,
    error: null,
    onCodeChange: vi.fn(),
    onJoin: vi.fn(),
    onBack: vi.fn(),
  };

  it('renders room code input', () => {
    render(<JoinRoomForm {...defaultProps} />);
    expect(screen.getByTestId('room-code-input')).toBeInTheDocument();
  });

  it('renders Join Room button', () => {
    render(<JoinRoomForm {...defaultProps} />);
    expect(screen.getByTestId('join-room-button')).toBeInTheDocument();
    expect(screen.getByText('Join Room')).toBeInTheDocument();
  });

  it('renders back button', () => {
    render(<JoinRoomForm {...defaultProps} />);
    expect(screen.getByText('← Back')).toBeInTheDocument();
  });

  it('calls onCodeChange when input changes', () => {
    render(<JoinRoomForm {...defaultProps} />);
    const input = screen.getByTestId('room-code-input');
    fireEvent.change(input, { target: { value: '1234' } });
    expect(defaultProps.onCodeChange).toHaveBeenCalledTimes(1);
  });

  it('calls onJoin when Join Room is clicked', () => {
    render(<JoinRoomForm {...defaultProps} roomCode="1234" />);
    fireEvent.click(screen.getByTestId('join-room-button'));
    expect(defaultProps.onJoin).toHaveBeenCalledTimes(1);
  });

  it('calls onBack when back is clicked', () => {
    render(<JoinRoomForm {...defaultProps} />);
    fireEvent.click(screen.getByText('← Back'));
    expect(defaultProps.onBack).toHaveBeenCalledTimes(1);
  });

  it('disables Join button when room code is less than 4 digits', () => {
    render(<JoinRoomForm {...defaultProps} roomCode="123" />);
    expect(screen.getByTestId('join-room-button')).toBeDisabled();
  });

  it('enables Join button when room code is 4 digits', () => {
    render(<JoinRoomForm {...defaultProps} roomCode="1234" />);
    expect(screen.getByTestId('join-room-button')).not.toBeDisabled();
  });

  it('disables Join button when loading', () => {
    render(<JoinRoomForm {...defaultProps} roomCode="1234" isLoading={true} />);
    expect(screen.getByTestId('join-room-button')).toBeDisabled();
  });

  it('shows loading text when isLoading is true', () => {
    render(<JoinRoomForm {...defaultProps} isLoading={true} />);
    expect(screen.getByText('Joining...')).toBeInTheDocument();
  });

  it('displays error message when error is provided', () => {
    render(<JoinRoomForm {...defaultProps} error="Room not found" />);
    expect(screen.getByText('Room not found')).toBeInTheDocument();
  });

  it('does not display error when error is null', () => {
    render(<JoinRoomForm {...defaultProps} error={null} />);
    expect(screen.queryByText('Room not found')).not.toBeInTheDocument();
  });

  it('displays the current room code value', () => {
    render(<JoinRoomForm {...defaultProps} roomCode="5678" />);
    expect(screen.getByTestId('room-code-input')).toHaveValue('5678');
  });
});
