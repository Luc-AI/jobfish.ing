import '@testing-library/jest-dom'

// Mock ResizeObserver for components using it (e.g., Radix UI Slider)
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

global.ResizeObserver = ResizeObserverMock as any
