import '@testing-library/jest-dom';
import { vi } from 'vitest';

// Mock ResizeObserver for recharts ResponsiveContainer
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

window.ResizeObserver = ResizeObserverMock as unknown as typeof ResizeObserver;
