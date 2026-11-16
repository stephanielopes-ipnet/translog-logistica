import { describe, expect, it } from "vitest";
import { parseRichText } from "./rich-text.ts";

describe("parseRichText", () => {
  it("keeps plain text and splits **bold** segments", () => {
    expect(parseRichText("O pedido **#375** está **Em Trânsito**.")).toEqual([
      {
        kind: "text",
        segments: [
          { text: "O pedido ", bold: false },
          { text: "#375", bold: true },
          { text: " está ", bold: false },
          { text: "Em Trânsito", bold: true },
          { text: ".", bold: false },
        ],
      },
    ]);
  });

  it("reads bullet lists written with *, - or •", () => {
    const lines = parseRichText(
      "Modalidades:\n*   **Standard Class**: 4 dias\n- First Class\n• Same Day",
    );

    expect(lines.map((line) => line.kind)).toEqual(["text", "bullet", "bullet", "bullet"]);
    expect(lines[1]).toEqual({
      kind: "bullet",
      level: 0,
      segments: [
        { text: "Standard Class", bold: true },
        { text: ": 4 dias", bold: false },
      ],
    });
  });

  it("indents nested bullets, up to two levels", () => {
    const lines = parseRichText("* item\n  * subitem\n    * sub-subitem\n        * fundo");

    expect(lines.map((line) => (line.kind === "bullet" ? line.level : null))).toEqual([0, 1, 2, 2]);
  });

  it("reads headings with one to three #", () => {
    expect(parseRichText("## **Prazo** de entrega\n#### quatro")).toEqual([
      {
        kind: "heading",
        segments: [
          { text: "Prazo", bold: true },
          { text: " de entrega", bold: false },
        ],
      },
      { kind: "text", segments: [{ text: "#### quatro", bold: false }] },
    ]);
  });

  it("does not take a line starting with **bold** for a bullet", () => {
    expect(parseRichText("**Atenção:** atraso")[0]?.kind).toBe("text");
  });

  it("keeps blank lines as spacing", () => {
    expect(parseRichText("Linha 1\n\nLinha 2").map((line) => line.kind)).toEqual([
      "text",
      "blank",
      "text",
    ]);
  });

  it("keeps unmatched asterisks as text", () => {
    expect(parseRichText("2 * 3 = 6 e **sem fim")).toEqual([
      { kind: "text", segments: [{ text: "2 * 3 = 6 e **sem fim", bold: false }] },
    ]);
  });
});
