import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { onTestFinished } from "vitest";

/**
 * Pasta temporária apagada ao fim do teste. Os testes com `DATA_SOURCE=databricks` usam uma
 * como `DATA_DIR`, para o cache local nunca ir parar no `portal/dados/` de quem roda os testes.
 */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "translog-teste-"));
  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}
