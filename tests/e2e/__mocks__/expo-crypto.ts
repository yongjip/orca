import { randomBytes } from 'node:crypto'

// Node-side type boundary; the mobile compiler checks Expo’s native declarations.
export function getRandomBytes(size: number): Uint8Array {
  return new Uint8Array(randomBytes(size))
}
