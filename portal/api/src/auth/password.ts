import { randomBytes, type ScryptOptions, scrypt, timingSafeEqual } from "node:crypto";

// Hash de senha com scrypt (node:crypto, sem dependência). Formato guardado no `.env`:
// `scrypt.<sal em base64url>.<chave em base64url>` (sem `$` nem `:`, que o compose e a lista
// `STAFF_USERS` interpretariam).

const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const SCRYPT_OPTIONS: ScryptOptions = { N: 16_384, r: 8, p: 1 };
const HASH_PATTERN = /^scrypt\.([\w-]{16,})\.([\w-]{40,})$/;

function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, KEY_LENGTH, SCRYPT_OPTIONS, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Gera o hash de uma senha (sal novo a cada chamada). */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await derive(password, salt);
  return `scrypt.${salt.toString("base64url")}.${key.toString("base64url")}`;
}

export function isPasswordHash(value: string): boolean {
  return HASH_PATTERN.test(value);
}

/** Confere a senha em tempo constante. Hash fora do formato = senha errada. */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const match = HASH_PATTERN.exec(stored);
  if (!match?.[1] || !match[2]) {
    return false;
  }
  const expected = Buffer.from(match[2], "base64url");
  const actual = await derive(password, Buffer.from(match[1], "base64url"));
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Hash de uma senha qualquer, para gastar o mesmo tempo quando o e-mail não existe. */
export const DUMMY_PASSWORD_HASH =
  "scrypt.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
