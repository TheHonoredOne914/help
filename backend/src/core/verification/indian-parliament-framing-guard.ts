export function validateIndianParliamentFraming(text: string) {
  const issues: string[] = [];
  if (/UN Security Council|member states|UN resolution|international community must/i.test(text)) {
    issues.push("UN-style framing detected.");
  }
  if (!/Treasury Bench|Opposition|Indian Mock Parliament|Lok Sabha|Rajya Sabha|committee/i.test(text)) {
    issues.push("Indian parliamentary framing is too weak.");
  }
  return { passed: issues.length === 0, issues };
}
