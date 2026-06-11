export const KNOWN_REAL_CASES = [
  { name: "Maneka Gandhi v. Union of India", year: "1978", article: "21" },
  { name: "Shreya Singhal v. Union of India", year: "2015", section: "66A" },
  { name: "S.G. Vombatkere v. Union of India", year: "2022", section: "124A" },
  { name: "K.S. Puttaswamy v. Union of India", year: "2017", article: "21" },
  { name: "Kesavananda Bharati v. State of Kerala", year: "1973", article: "368" },
  { name: "Minerva Mills v. Union of India", year: "1980", article: "368" },
  { name: "A.K. Gopalan v. State of Madras", year: "1950", article: "21" },
  { name: "ADM Jabalpur v. Shivkant Shukla", year: "1976", article: "21" },
  { name: "Indra Sawhney v. Union of India", year: "1992", article: "16" },
  { name: "Navtej Singh Johar v. Union of India", year: "2018", section: "377" },
  { name: "Joseph Shine v. Union of India", year: "2018", section: "497" },
  { name: "Anuradha Bhasin v. Union of India", year: "2020", article: "19" },
  { name: "PUCL v. Union of India", year: "1997", article: "21" },
  { name: "Vishaka v. State of Rajasthan", year: "1997", article: "14" },
  { name: "Olga Tellis v. Bombay Municipal Corporation", year: "1985", article: "21" },
  { name: "S.R. Bommai v. Union of India", year: "1994", article: "356" },
  { name: "I.R. Coelho v. State of Tamil Nadu", year: "2007", article: "31B" },
  { name: "NALSA v. Union of India", year: "2014", article: "14" },
  { name: "Subramanian Swamy v. Union of India", year: "2016", section: "499" },
  { name: "Tehseen S. Poonawalla v. Union of India", year: "2018", article: "21" },
  { name: "Hussainara Khatoon v. State of Bihar", year: "1979", article: "21" },
  { name: "D.K. Basu v. State of West Bengal", year: "1997", article: "21" },
  { name: "Lily Thomas v. Union of India", year: "2013", article: "102" },
];

export const KNOWN_FAKE_CASES = [
  "Sharma v. Union of India (2021)",
  "Raman Federation Case (2019)",
];

export function extractCitedCases(response: string): string[] {
  return response.match(/[A-Z][A-Za-z. ]+\sv\. [A-Z][A-Za-z. ]+(?:\s+\(\d{4}\))?/g) ?? [];
}

export function detectFakeCaseCitations(response: string): string[] {
  const citedCases = extractCitedCases(response);
  return citedCases.filter((caseRef) =>
    KNOWN_FAKE_CASES.some(fake => caseRef.includes(fake))
  );
}
