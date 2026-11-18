import { stdin, stdout } from "node:process";
import { hashPassword } from "../src/auth/password.ts";

// pnpm staff:add <email>: pede a senha sem mostrar o que é digitado e imprime a linha para o
// portal/.env. Nunca grava a senha em claro em lugar nenhum.

const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+$/.test(email)) {
  console.error("Uso: pnpm staff:add <email>   (ex.: pnpm staff:add ana@translog.com)");
  process.exit(1);
}

/** Lê uma linha do terminal sem eco (Enter termina, Ctrl+C cancela). */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    stdout.write(question);
    if (!stdin.isTTY) {
      // Sem terminal (ex.: senha por pipe): lê tudo da entrada.
      let data = "";
      stdin.setEncoding("utf8");
      stdin.on("data", (chunk) => {
        data += chunk;
      });
      stdin.on("end", () => resolve(data.split(/\r?\n/)[0] ?? ""));
      return;
    }
    let value = "";
    stdin.setRawMode(true);
    stdin.setEncoding("utf8");
    stdin.resume();
    const onData = (key: string) => {
      for (const char of key) {
        if (char === "\u0003") {
          stdout.write("\n");
          process.exit(130);
        }
        if (char === "\r" || char === "\n") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.off("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === "\u007f" || char === "\b") {
          value = value.slice(0, -1);
        } else {
          value += char;
        }
      }
    };
    stdin.on("data", onData);
  });
}

const password = await askHidden(`Senha para ${email}: `);
if (password.length < 8) {
  console.error("A senha precisa ter pelo menos 8 caracteres.");
  process.exit(1);
}
if (stdin.isTTY && (await askHidden("Repita a senha: ")) !== password) {
  console.error("As senhas não conferem.");
  process.exit(1);
}

const entry = `${email}:${await hashPassword(password)}`;
console.log("\nAcrescente ao portal/.env (vários usuários: separe por vírgula na mesma linha):\n");
console.log(`STAFF_USERS=${entry}`);
console.log("\nE, se ainda não tiver, um segredo para o cookie (pelo menos 32 caracteres):");
console.log("SESSION_SECRET=<gere com: openssl rand -base64 48>");
