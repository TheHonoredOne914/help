export function validateElectoralIntegrityLanguage(text: string) {
  const issues: string[] = [];
  if (/fraud happened|election was stolen|EVMs were manipulated/i.test(text)) {
    issues.push("Unsupported electoral fraud proof language.");
  }
  return {
    passed: issues.length === 0,
    issues,
    repairedText: text.replace(/fraud happened|election was stolen|EVMs were manipulated/gi, "electoral allegations require proof"),
  };
}
