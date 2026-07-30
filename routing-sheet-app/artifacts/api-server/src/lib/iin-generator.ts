/**
 * Generate a valid Kazakhstan IIN for a given birth date + gender.
 *
 * Used by seed.ts to create test candidates with IINs that pass the
 * parseIin() check-digit validation.
 *
 * The IIN format:
 *   1-6  → YYMMDD of birth date
 *   7    → century + gender:
 *            1 = male,   1800s
 *            2 = female, 1800s
 *            3 = male,   1900s
 *            4 = female, 1900s
 *            5 = male,   2000s
 *            6 = female, 2000s
 *   8-11 → arbitrary serial (we use 0001, 0002, …)
 *   12   → check digit (computed via the official KZ algorithm)
 */

const WEIGHTS_1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const WEIGHTS_2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

function computeCheckDigit(first11: string): number | null {
  const digits = first11.split("").map(Number);
  const sum1 = digits.reduce((acc, d, i) => acc + d * WEIGHTS_1[i], 0);
  const mod1 = sum1 % 11;
  if (mod1 === 10) {
    const sum2 = digits.reduce((acc, d, i) => acc + d * WEIGHTS_2[i], 0);
    const mod2 = sum2 % 11;
    if (mod2 === 10) return null;
    return mod2;
  }
  return mod1;
}

export function generateIin(opts: {
  birthDate: Date;
  gender: "male" | "female";
  /** 1-based serial number, becomes digits 8-11 (0001, 0002, …). */
  serial: number;
}): string {
  const d = opts.birthDate;
  const yy = String(d.getUTCFullYear()).slice(2).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(d.getUTCDate()).padStart(2, "0");

  // Century + gender digit
  const year = d.getUTCFullYear();
  let centuryDigit: number;
  if (year >= 1800 && year <= 1899) centuryDigit = opts.gender === "male" ? 1 : 2;
  else if (year >= 1900 && year <= 1999) centuryDigit = opts.gender === "male" ? 3 : 4;
  else if (year >= 2000 && year <= 2099) centuryDigit = opts.gender === "male" ? 5 : 6;
  else throw new Error(`Unsupported birth year: ${year}`);

  const serialStr = String(opts.serial).padStart(4, "0");
  const first11 = `${yy}${mm}${dd}${centuryDigit}${serialStr}`;
  const check = computeCheckDigit(first11);
  if (check === null) {
    // Try the next serial — some serials don't have a valid check digit
    return generateIin({ ...opts, serial: opts.serial + 1 });
  }
  return `${first11}${check}`;
}
