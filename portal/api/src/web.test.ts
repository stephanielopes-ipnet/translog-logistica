import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { errorResponseSchema } from "@translog/contracts";
import { describe, expect, it, onTestFinished } from "vitest";
import { loadConfig } from "./config.ts";
import { buildServer } from "./server.ts";
import { tempDir } from "./testing/temp-dir.ts";

const INDEX = "<!doctype html><title>TransLog</title><div id=root></div>";

/** Pasta que imita o `web/dist`: `index.html`, um arquivo com hash e um sem hash. */
function fakeDist() {
  const dir = tempDir();
  mkdirSync(join(dir, "assets"));
  writeFileSync(join(dir, "index.html"), INDEX);
  writeFileSync(join(dir, "assets", "app-abc123.js"), "console.log('ok')");
  writeFileSync(join(dir, "ipnet.svg"), "<svg/>");
  return dir;
}

async function buildWebServer(webDir?: string) {
  const env: NodeJS.ProcessEnv = webDir === undefined ? {} : { WEB_DIR: webDir };
  const app = await buildServer(loadConfig(env), { logger: false });
  onTestFinished(() => app.close());
  return app;
}

describe("tela servida pela API (WEB_DIR)", () => {
  it("serve o index.html na raiz, sem cache", async () => {
    const app = await buildWebServer(fakeDist());

    const response = await app.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.body).toBe(INDEX);
  });

  it("serve arquivos com hash em cache de um ano e os demais sem cache", async () => {
    const app = await buildWebServer(fakeDist());

    const asset = await app.inject({ method: "GET", url: "/assets/app-abc123.js" });
    const logo = await app.inject({ method: "GET", url: "/ipnet.svg" });

    expect(asset.statusCode).toBe(200);
    expect(asset.headers["content-type"]).toContain("javascript");
    expect(asset.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(logo.statusCode).toBe(200);
    expect(logo.headers["cache-control"]).toBe("no-cache");
  });

  it.each([
    "/rastreio",
    "/rastreio?pedido=76902",
    "/colaborador",
    "/colaborador/entrar",
    "/colaborador/pedidos/76902",
  ])("devolve o index.html nos endereços da tela (%s)", async (url) => {
    const app = await buildWebServer(fakeDist());

    const response = await app.inject({ method: "GET", url });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.headers["cache-control"]).toBe("no-cache");
    expect(response.body).toBe(INDEX);
  });

  it("não troca arquivo inexistente nem rota da API por index.html", async () => {
    const app = await buildWebServer(fakeDist());

    for (const url of ["/assets/nao-existe.js", "/api/nao-existe", "/api", "/docs/nao-existe"]) {
      const response = await app.inject({ method: "GET", url });

      expect(response.statusCode, url).toBe(404);
      expect(errorResponseSchema.safeParse(JSON.parse(response.body)).success, url).toBe(true);
    }
  });

  it("só devolve index.html para GET e HEAD", async () => {
    const app = await buildWebServer(fakeDist());

    const post = await app.inject({ method: "POST", url: "/rastreio", payload: {} });

    expect(post.statusCode).toBe(404);
    expect(errorResponseSchema.safeParse(JSON.parse(post.body)).success).toBe(true);
  });

  it("mantém a API e a documentação funcionando", async () => {
    const app = await buildWebServer(fakeDist());

    const health = await app.inject({ method: "GET", url: "/api/health" });
    const docs = await app.inject({ method: "GET", url: "/docs/json" });

    expect(health.statusCode).toBe(200);
    expect(JSON.parse(health.body).status).toBe("ok");
    expect(docs.statusCode).toBe(200);
  });

  it("não sai da pasta da tela", async () => {
    const app = await buildWebServer(fakeDist());

    for (const url of ["/../package.json", "/..%2fpackage.json", "/%2e%2e/%2e%2e/etc/passwd"]) {
      const response = await app.inject({ method: "GET", url });

      expect(response.body, url).not.toContain('"name"');
      expect(response.body, url).not.toContain("root:");
    }
  });

  it("sem WEB_DIR, a API não serve a tela (padrão do pnpm dev)", async () => {
    const app = await buildWebServer();

    const root = await app.inject({ method: "GET", url: "/" });
    const page = await app.inject({ method: "GET", url: "/rastreio" });

    expect(root.statusCode).toBe(404);
    expect(page.statusCode).toBe(404);
    expect(errorResponseSchema.safeParse(JSON.parse(page.body)).success).toBe(true);
  });

  it("recusa subir se WEB_DIR não tem index.html, dizendo o que fazer", async () => {
    const empty = tempDir();

    await expect(buildServer(loadConfig({ WEB_DIR: empty }), { logger: false })).rejects.toThrow(
      /não tem index\.html.*pnpm build/,
    );
  });
});
