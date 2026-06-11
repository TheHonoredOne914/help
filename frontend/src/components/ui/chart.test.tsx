import test from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { ChartContainer, sanitizeChartColor } from "./chart";

test("chart color sanitizer rejects CSS injection payloads", () => {
  for (const value of ["url(javascript:alert(1))", "javascript:alert(1)", "red;} body{display:none", "@import url(x)", "<style>"]) {
    assert.equal(sanitizeChartColor(value), null, value);
  }
});

test("chart color sanitizer allows safe color formats and CSS variables", () => {
  assert.equal(sanitizeChartColor("#aabbcc"), "#aabbcc");
  assert.equal(sanitizeChartColor("rgb(10, 20, 30)"), "rgb(10, 20, 30)");
  assert.equal(sanitizeChartColor("hsl(210 50% 40%)"), "hsl(210 50% 40%)");
  assert.equal(sanitizeChartColor("var(--chart-1)"), "var(--chart-1)");
});

test("chart style output omits unsafe color values", () => {
  const html = renderToStaticMarkup(
    <ChartContainer
      config={{
        safe: { color: "var(--chart-1)" },
        unsafe: { color: "url(javascript:alert(1))" },
      }}
    >
      <div />
    </ChartContainer>,
  );

  assert.match(html, /--color-safe: var\(--chart-1\)/);
  assert.doesNotMatch(html, /javascript:alert/);
});
