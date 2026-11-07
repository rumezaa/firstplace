/// <reference types="expo/types" />

// Tailwind's entry point is imported for its side effects, so TypeScript needs
// to be told that a .css import is a real thing. The NativeWind v5 docs call
// for exactly this.
declare module '*.css';
