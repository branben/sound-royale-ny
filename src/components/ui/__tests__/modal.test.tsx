import React, { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';

// Simple modal component for testing (shadcn/ui Dialog-like behavior)
function SimpleModal({
  isOpen,
  onClose,
  title,
  children,
}: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  if (!isOpen) return null;
  return (
    <div data-testid="modal" role="dialog">
      <div data-testid="modal-title">{title}</div>
      <div data-testid="modal-content">{children}</div>
      <button data-testid="modal-close" onClick={onClose}>
        Close
      </button>
    </div>
  );
}

function ModalTrigger() {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <div>
      <button data-testid="open-modal" onClick={() => setIsOpen(true)}>
        Open
      </button>
      <SimpleModal isOpen={isOpen} onClose={() => setIsOpen(false)} title="Test Modal">
        <div data-testid="modal-body">Modal content here</div>
      </SimpleModal>
    </div>
  );
}

describe('Modal Component', () => {
  it('does not render when closed', () => {
    render(<ModalTrigger />);
    expect(screen.queryByTestId('modal')).toBeNull();
  });

  it('renders when trigger is clicked', () => {
    render(<ModalTrigger />);
    fireEvent.click(screen.getByTestId('open-modal'));
    expect(screen.getByTestId('modal')).toBeTruthy();
    expect(screen.getByTestId('modal-title').textContent).toBe('Test Modal');
  });

  it('renders children content', () => {
    render(<ModalTrigger />);
    fireEvent.click(screen.getByTestId('open-modal'));
    expect(screen.getByTestId('modal-body').textContent).toBe('Modal content here');
  });

  it('closes when close button is clicked', () => {
    render(<ModalTrigger />);
    fireEvent.click(screen.getByTestId('open-modal'));
    expect(screen.getByTestId('modal')).toBeTruthy();

    fireEvent.click(screen.getByTestId('modal-close'));
    expect(screen.queryByTestId('modal')).toBeNull();
  });
});
