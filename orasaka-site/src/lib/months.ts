export function monthsLabel(n: number, locale: "ru" | "en" | "ja" = "ru") {
  if (locale === "en") return n === 1 ? "1 month" : `${n} months`;
  if (locale === "ja") return `${n}か月`;
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return `${n} месяц`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${n} месяца`;
  return `${n} месяцев`;
}
