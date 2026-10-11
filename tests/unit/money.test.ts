import { describe, expect, it } from "vitest";

import {
  MAX_PAISE,
  formatRupees,
  multiplyPaise,
  paiseToJson,
  parsePaise,
  rupeesToPaise,
  sumPaise,
  toPaise,
} from "@/lib/money";

/**
 * The money boundary (S1.1): exact integer paise as bigint, no float, no rounding, no silent coercion.
 */

const B = (n: number | string) => BigInt(n);

describe("parsePaise — the lossless database/JSON boundary", () => {
  it("accepts a bigint, a safe-integer number and a decimal string and yields a bigint", () => {
    expect(parsePaise(B(1900000))).toEqual({ ok: true, paise: B(1900000) });
    expect(parsePaise(1900000)).toEqual({ ok: true, paise: B(1900000) });
    expect(parsePaise("1900000")).toEqual({ ok: true, paise: B(1900000) });
    expect(parsePaise(" 2300000 ")).toEqual({ ok: true, paise: B(2300000) });
    expect(parsePaise(0)).toEqual({ ok: true, paise: B(0) });
    expect(parsePaise(MAX_PAISE)).toEqual({ ok: true, paise: MAX_PAISE });
  });

  it.each([
    [1.5, "not_integer"],
    ["19000.50", "not_integer"],
    [-1, "negative"],
    ["-1", "negative"],
    [B(-1), "negative"],
    [Number.NaN, "not_a_number"],
    [Number.POSITIVE_INFINITY, "not_a_number"],
    ["abc", "not_a_number"],
    ["", "not_a_number"],
    ["1e6", "not_a_number"],
    [null, "not_a_number"],
    [undefined, "not_a_number"],
    [{}, "not_a_number"],
    [Number.MAX_SAFE_INTEGER + 2, "unsafe"],
    [2 ** 53, "unsafe"],
    [MAX_PAISE + B(1), "too_large"],
    ["100000000001", "too_large"],
  ])("refuses %s with %s", (value, reason) => {
    expect(parsePaise(value)).toEqual({ ok: false, reason });
  });

  it("toPaise throws on a refused value and never returns a Number", () => {
    expect(() => toPaise(1.5)).toThrow(/not exact paise \(not_integer\)/);
    expect(typeof toPaise("1900000")).toBe("bigint");
  });

  it("paiseToJson serialises as a decimal string, not a Number", () => {
    expect(paiseToJson(B(2300000))).toBe("2300000");
    expect(paiseToJson(MAX_PAISE)).toBe("100000000000");
  });
});

describe("rupeesToPaise — exact rupees in, paise out", () => {
  it("converts whole rupees and up to two decimals exactly", () => {
    expect(rupeesToPaise(19000)).toEqual({ ok: true, paise: B(1900000) });
    expect(rupeesToPaise("21000")).toEqual({ ok: true, paise: B(2100000) });
    expect(rupeesToPaise("23000.5")).toEqual({ ok: true, paise: B(2300050) });
    expect(rupeesToPaise("0.07")).toEqual({ ok: true, paise: B(7) });
  });

  it("refuses more than two decimals, negatives and non-numbers", () => {
    expect(rupeesToPaise("1.234")).toEqual({
      ok: false,
      reason: "not_integer",
    });
    expect(rupeesToPaise("-5")).toEqual({ ok: false, reason: "negative" });
    expect(rupeesToPaise("₹19,000")).toEqual({
      ok: false,
      reason: "not_a_number",
    });
  });
});

describe("formatRupees — display only, Indian grouping", () => {
  it.each([
    [B(1900000), "₹19,000"],
    [B(2100000), "₹21,000"],
    [B(2300000), "₹23,000"],
    [B(0), "₹0"],
    [B(99), "₹0.99"],
    [B(100), "₹1"],
    [B(123456), "₹1,234.56"],
    [B(1234567), "₹12,345.67"],
    [B(100000000), "₹10,00,000"],
    [B(123456789), "₹12,34,567.89"],
    [B(100000000000), "₹1,00,00,00,000"],
  ])("formats %s as %s", (paise, expected) => {
    expect(formatRupees(paise)).toBe(expected);
  });

  it("refuses a negative amount", () => {
    expect(() => formatRupees(B(-1))).toThrow(RangeError);
  });
});

describe("multiplyPaise and sumPaise — exact totals", () => {
  it("multiplies within the quantity cap and the bound", () => {
    expect(multiplyPaise(B(1900000), 1)).toEqual({
      ok: true,
      paise: B(1900000),
    });
    expect(multiplyPaise(B(2300000), 99)).toEqual({
      ok: true,
      paise: B(227700000),
    });
    expect(multiplyPaise(B(1900000), 0)).toEqual({
      ok: false,
      reason: "not_integer",
    });
    expect(multiplyPaise(B(1900000), 100)).toEqual({
      ok: false,
      reason: "not_integer",
    });
    expect(multiplyPaise(B(1900000), 1.5)).toEqual({
      ok: false,
      reason: "not_integer",
    });
    expect(multiplyPaise(MAX_PAISE, 2)).toEqual({
      ok: false,
      reason: "too_large",
    });
  });

  it("sums exactly and treats an unknown charge (null) as contributing nothing", () => {
    expect(sumPaise([B(1900000), null, null])).toEqual({
      ok: true,
      paise: B(1900000),
    });
    expect(sumPaise([B(1900000), B(2100000)])).toEqual({
      ok: true,
      paise: B(4000000),
    });
    expect(sumPaise([MAX_PAISE, B(1)])).toEqual({
      ok: false,
      reason: "too_large",
    });
    expect(sumPaise([B(-1)])).toEqual({ ok: false, reason: "negative" });
  });
});
