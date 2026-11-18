import { describe, expect, it } from "vitest";
import { createLoginLimiter } from "./login-limiter.ts";
import { hashPassword, isPasswordHash, verifyPassword } from "./password.ts";
import { createSessionToken, readSessionToken } from "./session-signature.ts";

const SECRET = "segredo-de-teste-com-mais-de-32-caracteres";

describe("hash de senha (scrypt)", () => {
  it("gera hash no formato do .env, com sal novo a cada vez, e confere a senha", async () => {
    const first = await hashPassword("senha forte");
    const second = await hashPassword("senha forte");

    expect(isPasswordHash(first)).toBe(true);
    expect(first).not.toBe(second);
    expect(first).not.toContain("senha");
    await expect(verifyPassword("senha forte", first)).resolves.toBe(true);
    await expect(verifyPassword("senha errada", first)).resolves.toBe(false);
  });

  it("trata hash fora do formato como senha errada", async () => {
    await expect(verifyPassword("x", "texto-em-claro")).resolves.toBe(false);
    expect(isPasswordHash("scrypt$a$b")).toBe(false);
  });
});

describe("token de sessão (HMAC)", () => {
  const now = 1_000_000;

  it("lê o e-mail de um token válido", () => {
    const token = createSessionToken({ email: "ana@translog.com", expiresAt: now + 10 }, SECRET);
    expect(readSessionToken(token, SECRET, now)).toEqual({
      email: "ana@translog.com",
      expiresAt: now + 10,
    });
  });

  it("recusa token vencido, adulterado, de outro segredo ou malformado", () => {
    const token = createSessionToken({ email: "ana@translog.com", expiresAt: now + 10 }, SECRET);
    const [payload, signature] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ e: "chefe@translog.com", x: now + 10 })).toString(
      "base64url",
    );

    expect(readSessionToken(token, SECRET, now + 10)).toBeNull();
    expect(readSessionToken(`${forged}.${signature}`, SECRET, now)).toBeNull();
    expect(readSessionToken(`${payload}.${signature}x`, SECRET, now)).toBeNull();
    expect(readSessionToken(token, `${SECRET}-outro`, now)).toBeNull();
    expect(readSessionToken("abc", SECRET, now)).toBeNull();
    expect(readSessionToken(`${token}.extra`, SECRET, now)).toBeNull();
    expect(readSessionToken(undefined, SECRET, now)).toBeNull();
  });
});

describe("limite de tentativas", () => {
  it("bloqueia depois de N falhas na janela e libera quando ela passa", () => {
    let time = 0;
    const limiter = createLoginLimiter({ maxFailures: 2, windowMs: 1000, now: () => time });

    limiter.recordFailure("1.1.1.1");
    expect(limiter.isBlocked("1.1.1.1")).toBe(false);
    limiter.recordFailure("1.1.1.1");
    expect(limiter.isBlocked("1.1.1.1")).toBe(true);
    expect(limiter.isBlocked("2.2.2.2")).toBe(false);

    time = 1000;
    expect(limiter.isBlocked("1.1.1.1")).toBe(false);
  });

  it("esquece as janelas vencidas ao registrar uma falha nova", () => {
    let time = 0;
    const limiter = createLoginLimiter({ maxFailures: 5, windowMs: 1000, now: () => time });
    for (let index = 0; index < 50; index++) {
      limiter.recordFailure(`10.0.0.${index}`);
    }
    expect(limiter.trackedIps()).toBe(50);

    time = 1500;
    limiter.recordFailure("10.0.1.1");

    expect(limiter.trackedIps()).toBe(1);
  });

  it("com IPs demais, esquece os mais antigos e continua bloqueando os recentes", () => {
    let time = 0;
    const limiter = createLoginLimiter({
      maxFailures: 1,
      windowMs: 60_000,
      maxTrackedIps: 3,
      now: () => time,
    });
    for (const ip of ["a", "b", "c", "d"]) {
      time++;
      limiter.recordFailure(ip);
    }

    expect(limiter.trackedIps()).toBe(3);
    expect(limiter.isBlocked("a")).toBe(false);
    expect(limiter.isBlocked("d")).toBe(true);
  });

  it("zera as falhas depois de um login certo", () => {
    const limiter = createLoginLimiter({ maxFailures: 1, windowMs: 1000, now: () => 0 });
    limiter.recordFailure("ip");
    limiter.reset("ip");
    expect(limiter.isBlocked("ip")).toBe(false);
  });
});
