export type PasswordStrengthLevel = "too_weak" | "weak" | "fair" | "strong";

export type PasswordStrengthResult = {
  score: 0 | 1 | 2 | 3 | 4;
  level: PasswordStrengthLevel;
  ok: boolean;
  checks: {
    minLength: boolean;
    hasLower: boolean;
    hasUpper: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
  };
  hints: string[];
};

const MIN_LENGTH = 8;

/** Client-side password strength for signup (no deps). Requires score ≥ 3 to submit. */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const checks = {
    minLength: password.length >= MIN_LENGTH,
    hasLower: /[a-z]/.test(password),
    hasUpper: /[A-Z]/.test(password),
    hasNumber: /\d/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
  };

  let score = 0 as PasswordStrengthResult["score"];
  if (checks.minLength) score = 1;
  const variety = [checks.hasLower, checks.hasUpper, checks.hasNumber, checks.hasSymbol].filter(Boolean).length;
  if (checks.minLength && variety >= 2) score = 2;
  if (checks.minLength && variety >= 3) score = 3;
  if (password.length >= 12 && variety >= 3) score = 4;
  if (password.length >= 16 && variety === 4) score = 4;

  const hints: string[] = [];
  if (!checks.minLength) hints.push(`Use at least ${MIN_LENGTH} characters`);
  if (!checks.hasLower) hints.push("Add a lowercase letter");
  if (!checks.hasUpper) hints.push("Add an uppercase letter");
  if (!checks.hasNumber) hints.push("Add a number");
  if (!checks.hasSymbol) hints.push("Add a symbol (!@#$…)");
  if (checks.minLength && variety >= 3 && password.length < 12) {
    hints.push("12+ characters makes this stronger");
  }

  const level: PasswordStrengthLevel =
    score <= 1 ? "too_weak" : score === 2 ? "weak" : score === 3 ? "fair" : "strong";

  return {
    score,
    level,
    ok: score >= 3,
    checks,
    hints: hints.slice(0, 3),
  };
}

export function passwordStrengthLabel(level: PasswordStrengthLevel): string {
  switch (level) {
    case "too_weak":
      return "Too weak";
    case "weak":
      return "Weak";
    case "fair":
      return "Fair";
    case "strong":
      return "Strong";
  }
}
