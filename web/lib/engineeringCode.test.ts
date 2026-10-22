import test from "node:test";
import assert from "node:assert/strict";
import { isEngineeringCode } from "./engineeringCode";

test("EFI: any engineering subject (I***) with a 4-digit number is valid", () => {
  for (const c of ["IMEC 1310", "ibio-2240", "ISIS1204", "IIND2101", "ICYA1116", "IQUI 2010", "IELE3206", "IELE 2100L"]) assert.ok(isEngineeringCode(c), c);
});

test("EFI: other faculties, bare subjects and wildcards are not", () => {
  for (const c of ["MATE 1203", "FISI1518", "IMEC", "IELE 301X", "DERE1300", ""]) assert.ok(!isEngineeringCode(c), c);
});
