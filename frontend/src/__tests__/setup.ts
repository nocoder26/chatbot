import '@testing-library/jest-dom';
import React from 'react';

const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => { store[key] = value; },
    removeItem: (key: string) => { delete store[key]; },
    clear: () => { store = {}; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] || null,
  };
})();

Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock fetch globally
global.fetch = vi.fn(() =>
  Promise.resolve({
    ok: true,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(''),
    blob: () => Promise.resolve(new Blob()),
  } as Response)
);

// Mock next/navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock framer-motion
vi.mock('framer-motion', () => {
  const createMotionComponent = (tag: string) => {
    const Component = React.forwardRef(({ children, ...props }: any, ref: any) => {
      const { initial, animate, exit, transition, whileHover, whileTap, whileFocus, variants, layout, ...rest } = props;
      return React.createElement(tag, { ...rest, ref }, children);
    });
    Component.displayName = `motion.${tag}`;
    return Component;
  };

  return {
    motion: {
      div: createMotionComponent('div'),
      button: createMotionComponent('button'),
      span: createMotionComponent('span'),
      p: createMotionComponent('p'),
      section: createMotionComponent('section'),
      h1: createMotionComponent('h1'),
      h2: createMotionComponent('h2'),
      img: createMotionComponent('img'),
      input: createMotionComponent('input'),
      label: createMotionComponent('label'),
      a: createMotionComponent('a'),
      li: createMotionComponent('li'),
      ul: createMotionComponent('ul'),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => children,
    useAnimation: () => ({ start: vi.fn() }),
    useMotionValue: (init: number) => ({ get: () => init, set: vi.fn() }),
  };
});
