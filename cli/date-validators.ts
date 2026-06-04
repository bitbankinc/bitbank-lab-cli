import { daysInMonth, YEARLY_TYPES, yearUtc } from "./date-utils.js";
import { EXIT } from "./exit-codes.js";
import type { Result } from "./types.js";

const MIN_YEAR = 2010;
const YEAR_LOOKAHEAD = 5;

function maxYear(): number {
  return Number(yearUtc(Date.now())) + YEAR_LOOKAHEAD;
}

function checkYearRange(yStr: string, label: string): string | null {
  const y = Number(yStr);
  const max = maxYear();
  if (y < MIN_YEAR || y > max) {
    return `${label}: year '${yStr}' is out of range (${MIN_YEAR}-${max})`;
  }
  return null;
}

function paramErr(error: string): Result<string> {
  return { success: false, error, exitCode: EXIT.PARAM };
}

function validateYmd(date: string, label: string): Result<string> {
  if (!/^\d{8}$/.test(date)) return paramErr(`${label} must be a date (e.g. 20250301)`);
  const yStr = date.slice(0, 4);
  const mStr = date.slice(4, 6);
  const dStr = date.slice(6, 8);
  const yErr = checkYearRange(yStr, label);
  if (yErr) return paramErr(yErr);
  const m = Number(mStr);
  if (m < 1 || m > 12) return paramErr(`${label}: month '${mStr}' is invalid`);
  const d = Number(dStr);
  const maxDay = daysInMonth(Number(yStr), m);
  if (d < 1 || d > maxDay) {
    return paramErr(`${label}: day '${dStr}' is invalid for ${yStr}-${mStr}`);
  }
  return { success: true, data: date };
}

function validateYyyy(date: string, label: string): Result<string> {
  if (!/^\d{4}$/.test(date)) {
    return paramErr(`${label} must be a year (e.g. 2025). Use 1hour or shorter for daily data`);
  }
  const yErr = checkYearRange(date, label);
  if (yErr) return paramErr(yErr);
  return { success: true, data: date };
}

export function validateDateFormat(date: string, type: string, label: string): Result<string> {
  return YEARLY_TYPES.has(type) ? validateYyyy(date, label) : validateYmd(date, label);
}
