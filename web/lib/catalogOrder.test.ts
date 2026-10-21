import test from "node:test";
import assert from "node:assert/strict";
import { sortCatalogs } from "./catalogOrder";

test("catalog order: Electrónica, Eléctrica, Doble programa, Maestrías (standard before variants)", () => {
  const list = [
    { slug: "m-maia", programName: "Maestría en Inteligencia Artificial", variantLabel: "" },
    { slug: "doble-cbu3", programName: "Doble programa Ing. Eléctrica e Ing. Electrónica", variantLabel: "" },
    { slug: "iele-cbu3-pc", programName: "Ingeniería Eléctrica", variantLabel: "Con Precálculo" },
    { slug: "m-iele", programName: "Maestría en Ingeniería Eléctrica", variantLabel: "" },
    { slug: "iele-cbu3", programName: "Ingeniería Eléctrica", variantLabel: "" },
    { slug: "ielc-cbu3-pc", programName: "Ingeniería Electrónica", variantLabel: "Con Precálculo" },
    { slug: "ielc-cbu3", programName: "Ingeniería Electrónica", variantLabel: "" },
  ];
  assert.deepEqual(
    sortCatalogs(list).map((c) => c.slug),
    ["ielc-cbu3", "ielc-cbu3-pc", "iele-cbu3", "iele-cbu3-pc", "doble-cbu3", "m-iele", "m-maia"]
  );
});
