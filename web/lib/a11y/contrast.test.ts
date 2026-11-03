// Colour contrast of the classification colours (review 2026-10-29 §7.3,
// proposal: WCAG AA 4.5:1 for text). Every --t-* / --st-* token is used as a
// card fill under white text, and as text on white.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const css = readFileSync(resolve(process.cwd(), "components/explorer/tokens.css"), "utf8");

function lum(hex: string): number {
  const n = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export function contrast(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

test("classification and status colours reach 4.5:1 against white", () => {
  const tokens = [...css.matchAll(/--((?:t|st)-[a-z]+):\s*(#[0-9a-fA-F]{6})/g)].map((m) => [m[1], m[2]] as const);
  assert.ok(tokens.length >= 8);
  for (const [name, hex] of tokens) {
    if (/blocked/.test(name)) continue; // hatched fills behind dark text, not text colours
    const r = contrast(hex, "#ffffff");
    assert.ok(r >= 4.5, `--${name} ${hex}: ${r.toFixed(2)}:1`);
  }
});

test("every group fill has a secondary text colour that reaches 4.5:1 on it", () => {
  const hex = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))?.[1];
  for (const g of ["iele", "fing", "ftiee", "fesp", "ciencias", "otr", "pro", "ele", "cbu", "req"]) {
    const fill = hex(`t-${g}`);
    const second = hex(`on-type-2-${g}`);
    assert.ok(fill && second, `--t-${g} / --on-type-2-${g}`);
    const r = contrast(second, fill);
    assert.ok(r >= 4.5, `--on-type-2-${g} ${second} on ${fill}: ${r.toFixed(2)}:1`);
  }
});

test("Fundamentos de Ingeniería doesn't read as the 'aprobada' green", () => {
  const hex = (name: string) => css.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`))![1];
  assert.ok(contrast(hex("t-fing"), hex("st-ok")) >= 1.3);
});

test("the new warning colours (cart warnings, amber box) reach AA", () => {
  assert.ok(contrast("#78350f", "#fffbeb") >= 4.5);
  assert.ok(contrast("#7c2d12", "#fff7ed") >= 4.5);
  assert.ok(contrast("#1e40af", "#dbeafe") >= 4.5);
});
