export interface IndianParliamentFramingOptions {
  committeeSystem?: string;
}

export function validateIndianParliamentFraming(text: string, options: IndianParliamentFramingOptions = {}) {
  const issues: string[] = [];
  if (/UN Security Council|member states|UN resolution|international community must/i.test(text)) {
    issues.push("UN-style framing detected.");
  }
  if (!/Treasury Bench|Opposition|Indian Mock Parliament|Lok Sabha|Rajya Sabha|committee/i.test(text)) {
    issues.push("Indian parliamentary framing is too weak.");
  }
  if (options.committeeSystem === "indian_mock_parliament") {
    if (!/Treasury Bench/i.test(text) || !/Opposition/i.test(text)) {
      issues.push("Treasury/Opposition framing missing.");
    }
  }
  return { passed: issues.length === 0, issues };
}
