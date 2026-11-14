import { describe, expect, it } from "vitest";
import {
  formatCurrency,
  formatDate,
  formatDelayLabel,
  formatManifestCode,
  onlyDigits,
  pluralize,
  splitPlace,
} from "./format.ts";

describe("format utilities", () => {
  it("formats calendar dates without timezone shift (even before 03:00Z)", () => {
    expect(formatDate("2015-01-01")).toBe("01/01/2015");
    expect(formatDate("2015-01-01T01:15:00.000Z")).toBe("01/01/2015");
    expect(formatDate(null)).toBe("—");
    expect(formatDate("")).toBe("—");
  });

  it("formats USD currency in pt-BR locale", () => {
    const formatted = formatCurrency(773.89).replace(/\s+/g, " ");
    expect(formatted).toBe("US$ 773,89");
  });

  it("pluralizes counts properly", () => {
    expect(pluralize(1, "item", "itens")).toBe("1 item");
    expect(pluralize(4, "dia", "dias")).toBe("4 dias");
  });

  it("extracts only digits up to maxLength", () => {
    expect(onlyDigits("#375-abc")).toBe("375");
    expect(onlyDigits("12345678901234", 10)).toBe("1234567890");
  });

  it("splits origin and destination into city and region/country", () => {
    expect(splitPlace("San Benito, Texas, Estados Unidos")).toEqual({
      city: "San Benito",
      rest: "Texas, Estados Unidos",
    });
  });

  it("builds technical manifest codes", () => {
    expect(formatManifestCode({ orderId: 375, market: "LATAM" })).toBe("TL-000375-LATAM");
    expect(formatManifestCode({ orderId: 20322, market: "Pacific Asia" })).toBe(
      "TL-020322-PACIFICASIA",
    );
  });

  it("formats delay labels", () => {
    expect(formatDelayLabel(4)).toBe("4 dias de atraso");
    expect(formatDelayLabel(1)).toBe("1 dia de atraso");
    expect(formatDelayLabel(-1)).toBe("1 dia adiantado");
    expect(formatDelayLabel(0)).toBe("dentro do prazo");
    expect(formatDelayLabel(null)).toBeNull();
  });
});
