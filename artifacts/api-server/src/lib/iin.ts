/**
 * Kazakhstan IIN (ИИН) parser.
 *
 * ИИН format (12 digits):
 *   positions 1-6  → birth date as YYMMDD
 *   position  7    → century + gender:
 *                      1 = male,   1800s
 *                      2 = female, 1800s
 *                      3 = male,   1900s
 *                      4 = female, 1900s
 *                      5 = male,   2000s
 *                      6 = female, 2000s
 *   positions 8-11 → serial number
 *   position  12   → check digit (Kazakhstan-specific algorithm)
 *
 * Reference: Постановление Правительства РК от 11.06.2013 № 554.
 */

import type { Gender } from "@workspace/db";

export interface ParsedIin {
  birthDate: Date | null;
  gender: Gender | null;
  /** True when the IIN passes the format + check-digit validation. */
  valid: boolean;
  /** Human-readable error message when `valid` is false. */
  error?: string;
}

/** Validates that the input contains exactly 12 digits. */
export function isIinFormat(input: string): boolean {
  return /^\d{12}$/.test(input.trim());
}

/**
 * Compute the Kazakhstan IIN check digit (12th digit) using the official
 * algorithm. Returns the expected check digit (0-9), or `null` if the input
 * is malformed.
 */
export function computeIinCheckDigit(iin: string): number | null {
  const digits = iin.trim();
  if (!/^\d{12}$/.test(digits)) return null;

  // Weights for the first pass
  const weights1 = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
  // Weights for the second pass (used if the first pass yields 10)
  const weights2 = [3, 4, 5, 6, 7, 8, 9, 10, 11, 1, 2];

  const first11 = digits.slice(0, 11).split("").map(Number);
  const last = Number(digits[11]);

  const sum1 = first11.reduce((acc, d, i) => acc + d * weights1[i], 0);
  const mod1 = sum1 % 11;

  if (mod1 === 10) {
    // Second pass with different weights
    const sum2 = first11.reduce((acc, d, i) => acc + d * weights2[i], 0);
    const mod2 = sum2 % 11;
    if (mod2 === 10) return null; // Invalid IIN — both passes gave 10
    return mod2 === last ? last : mod2;
  }

  return mod1 === last ? last : mod1;
}

/**
 * Returns `true` if the IIN's check digit is correct.
 * (Does NOT verify that the birth date is real — use `parseIin` for that.)
 */
export function isIinCheckDigitValid(iin: string): boolean {
  const digits = iin.trim();
  if (!/^\d{12}$/.test(digits)) return false;
  const expected = computeIinCheckDigit(digits);
  if (expected === null) return false;
  return Number(digits[11]) === expected;
}

/** Parse an IIN into birth date + gender, validating both format and check digit. */
export function parseIin(input: string): ParsedIin {
  const iin = input.trim();

  if (!/^\d{12}$/.test(iin)) {
    return {
      birthDate: null,
      gender: null,
      valid: false,
      error: "ИИН должен состоять из 12 цифр",
    };
  }

  // 7th digit (index 6) encodes century + gender
  const centuryGenderDigit = Number(iin[6]);
  if (centuryGenderDigit < 1 || centuryGenderDigit > 6) {
    return {
      birthDate: null,
      gender: null,
      valid: false,
      error: "Неверный 7-й разряд ИИН (век/пол)",
    };
  }

  const gender: Gender = centuryGenderDigit % 2 === 1 ? "male" : "female";
  const centuryBase =
    centuryGenderDigit === 1 || centuryGenderDigit === 2 ? 1800 :
    centuryGenderDigit === 3 || centuryGenderDigit === 4 ? 1900 :
    2000;

  // Birth date: YYMMDD
  const yy = Number(iin.slice(0, 2));
  const mm = Number(iin.slice(2, 4));
  const dd = Number(iin.slice(4, 6));
  const year = centuryBase + yy;

  // Construct with UTC to avoid TZ shifting the day; we only care about
  // the calendar date, not the moment in time.
  const birthDate = new Date(Date.UTC(year, mm - 1, dd));
  // Validate the date actually exists (e.g. reject 31 February)
  if (
    birthDate.getUTCFullYear() !== year ||
    birthDate.getUTCMonth() !== mm - 1 ||
    birthDate.getUTCDate() !== dd
  ) {
    return {
      birthDate: null,
      gender,
      valid: false,
      error: "ИИН содержит несуществующую дату рождения",
    };
  }

  // Reject future birth dates — a candidate cannot be born tomorrow
  const now = new Date();
  if (birthDate.getTime() > now.getTime()) {
    return {
      birthDate,
      gender,
      valid: false,
      error: "Дата рождения из ИИН — в будущем",
    };
  }

  // Check digit
  if (!isIinCheckDigitValid(iin)) {
    return {
      birthDate,
      gender,
      valid: false,
      error: "Контрольный разряд ИИН неверен — проверьте ввод",
    };
  }

  return { birthDate, gender, valid: true };
}

/**
 * Format a Date (from IIN parsing) as `DD.MM.YYYY` for display.
 * Returns an empty string if the date is null.
 */
export function formatBirthDate(d: Date | null): string {
  if (!d) return "";
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

/** Russian labels for the gender enum. */
export const GENDER_LABELS: Record<Gender, string> = {
  male: "Мужской",
  female: "Женский",
};
