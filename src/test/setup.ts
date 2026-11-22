/// <reference types="vitest/jsdom" />
import "@testing-library/jest-dom/vitest";

// Use the test page's storage even when Node exposes its own Web Storage global.
Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: jsdom.window.localStorage,
});

Object.defineProperty(window, "scrollTo", {
  writable: true,
  value: () => {},
});

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});
