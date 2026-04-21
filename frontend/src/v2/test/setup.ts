// frontend/src/v2/test/setup.ts
// Vitest 测试环境初始化（来自 tmp/platform-redesign/src/test/setup.ts）
import '@testing-library/jest-dom/vitest'

class MemoryStorage implements Storage {
  private store = new Map<string, string>()
  get length() {
    return this.store.size
  }
  clear(): void {
    this.store.clear()
  }
  getItem(key: string): string | null {
    return this.store.has(key) ? (this.store.get(key) as string) : null
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null
  }
  removeItem(key: string): void {
    this.store.delete(key)
  }
  setItem(key: string, value: string): void {
    this.store.set(key, String(value))
  }
}

if (typeof window !== 'undefined') {
  if (
    typeof window.localStorage === 'undefined' ||
    typeof window.localStorage.getItem !== 'function'
  ) {
    Object.defineProperty(window, 'localStorage', {
      value: new MemoryStorage(),
      configurable: true,
    })
  }
  if (
    typeof window.sessionStorage === 'undefined' ||
    typeof window.sessionStorage.getItem !== 'function'
  ) {
    Object.defineProperty(window, 'sessionStorage', {
      value: new MemoryStorage(),
      configurable: true,
    })
  }
  if (typeof window.matchMedia === 'undefined') {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      configurable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => {},
        removeEventListener: () => {},
        addListener: () => {},
        removeListener: () => {},
        dispatchEvent: () => false,
      }),
    })
  }
}
