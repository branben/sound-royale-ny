import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Component that throws during render
function BrokenComponent(): React.ReactElement {
  throw new Error('Test render error');
}

// Component that renders normally
function WorkingComponent(): React.ReactElement {
  return <div data-testid="working">I work</div>;
}

describe('ErrorBoundary', () => {
  // Suppress console.error from React's error boundary logging
  const originalError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalError;
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <WorkingComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByTestId('working')).toBeTruthy();
    expect(screen.getByTestId('working').textContent).toBe('I work');
  });

  it('renders fallback UI when child throws', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Something went wrong')).toBeTruthy();
  });

  it('shows error message in fallback', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Test render error')).toBeTruthy();
  });

  it('provides a retry button', () => {
    render(
      <ErrorBoundary>
        <BrokenComponent />
      </ErrorBoundary>,
    );

    expect(screen.getByText('Try again')).toBeTruthy();
  });
});
