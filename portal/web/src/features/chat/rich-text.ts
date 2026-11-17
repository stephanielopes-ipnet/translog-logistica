// Formatação simples das respostas do assistente, sem HTML: o texto vira dados e o
// componente monta os elementos React (nada de `dangerouslySetInnerHTML`).
// Entende **negrito**, títulos (`# `, `## `, `### `) e listas (`* `, `- `, `• `), que é o que o
// agente de IA costuma usar. O resto (tabelas, links) aparece como texto.

export interface RichSegment {
  text: string;
  bold: boolean;
}

export type RichLine =
  | { kind: "text"; segments: RichSegment[] }
  | { kind: "heading"; segments: RichSegment[] }
  | { kind: "bullet"; level: number; segments: RichSegment[] }
  | { kind: "blank" };

/** Item de lista: marcador seguido de espaço ("**negrito**" no começo da linha não conta). */
const BULLET = /^(\s*)[*\-•]\s+(.*)$/;
const HEADING = /^\s*#{1,3}\s+(.*)$/;

/** Divide o texto em linhas já classificadas, com os trechos em negrito separados. */
export function parseRichText(text: string): RichLine[] {
  return text.split("\n").map((line): RichLine => {
    if (line.trim() === "") {
      return { kind: "blank" };
    }
    const heading = HEADING.exec(line);
    if (heading) {
      return { kind: "heading", segments: parseBold(heading[1] ?? "") };
    }
    const bullet = BULLET.exec(line);
    if (bullet) {
      // 2 ou mais espaços antes do marcador = subitem (no máximo 2 níveis abaixo).
      const level = Math.min(Math.floor((bullet[1] ?? "").length / 2), 2);
      return { kind: "bullet", level, segments: parseBold(bullet[2] ?? "") };
    }
    return { kind: "text", segments: parseBold(line) };
  });
}

/** `"O pedido **#375** chega"` → trechos normais e em negrito. */
function parseBold(line: string): RichSegment[] {
  return line
    .split(/(\*\*.+?\*\*)/g)
    .filter((part) => part !== "")
    .map((part) =>
      part.length > 4 && part.startsWith("**") && part.endsWith("**")
        ? { text: part.slice(2, -2), bold: true }
        : { text: part, bold: false },
    );
}
