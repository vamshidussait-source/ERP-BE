import { randomInt } from 'crypto';

/**
 * Alphabet for temporary passwords. Deliberately excludes visually
 * ambiguous characters (0/O/o, 1/l/I) so passwords can be read aloud or
 * copied from print without errors.
 */
const UPPERCASE = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const LOWERCASE = 'abcdefghijkmnpqrstuvwxyz';
const DIGITS = '23456789';
const ALPHABET = UPPERCASE + LOWERCASE + DIGITS;

/**
 * Length of generated temporary passwords. 12 characters over a
 * 76-character alphabet ≈ 74 bits of entropy — reasonably strong for a
 * short-lived credential that must be changed on first login.
 */
const LENGTH = 12;

/**
 * Generates a cryptographically random temporary password using
 * crypto.randomInt (uniform, no modulo bias). Only the bcrypt hash is ever
 * persisted; the plain-text value lives just long enough to be returned
 * once in the API response and is never logged.
 */
export function GenerateTempPassword(): string {
  let password = '';
  for (let i = 0; i < LENGTH; i++) {
    password += ALPHABET[randomInt(ALPHABET.length)];
  }
  return password;
}
