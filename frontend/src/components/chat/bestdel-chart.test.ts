import test from "node:test";
import assert from "node:assert/strict";
import { parseBestdelChartSpec } from "./bestdel-chart";

test("parseBestdelChartSpec accepts a valid bar chart", () => {
  const spec = parseBestdelChartSpec(
    JSON.stringify({
      type: "bar",
      title: "NFHS-6",
      xKey: "group",
      series: [{ key: "pct", label: "%" }],
      data: [
        { group: "Women", pct: 30.7 },
        { group: "Men", pct: 27.3 },
      ],
      cite: 6,
    }),
  );
  assert.ok(spec);
  assert.equal(spec?.type, "bar");
  assert.equal(spec?.data.length, 2);
  assert.equal(spec?.cite, 6);
});

test("parseBestdelChartSpec rejects invalid JSON", () => {
  assert.equal(parseBestdelChartSpec("{not json"), null);
});

test("parseBestdelChartSpec rejects empty data", () => {
  assert.equal(
    parseBestdelChartSpec(
      JSON.stringify({
        type: "bar",
        xKey: "group",
        series: [{ key: "pct" }],
        data: [],
      }),
    ),
    null,
  );
});

test("parseBestdelChartSpec rejects unsupported chart type", () => {
  assert.equal(
    parseBestdelChartSpec(
      JSON.stringify({
        type: "scatter",
        xKey: "group",
        series: [{ key: "pct" }],
        data: [{ group: "A", pct: 1 }],
      }),
    ),
    null,
  );
});
