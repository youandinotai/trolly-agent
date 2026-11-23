export const MINIMUM_AGE = 21;

function birthDateParts(value: string): [number, number, number] | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(year, month - 1, day);
  if (
    year < 1900 ||
    month < 1 ||
    month > 12 ||
    day < 1 ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) return null;
  return [year, month, day];
}

export function isValidBirthDate(value: string, today = new Date()): boolean {
  const parts = birthDateParts(value);
  if (!parts) return false;
  const [year, month, day] = parts;
  const current = [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  if (year > current[0]) return false;
  return year < current[0] || month < current[1] || (month === current[1] && day <= current[2]);
}

export function isAtLeastMinimumAge(value: string, today = new Date()): boolean {
  if (!isValidBirthDate(value, today)) return false;
  const [year, month, day] = birthDateParts(value)!;
  const currentYear = today.getFullYear();
  const birthdayHasPassed =
    today.getMonth() + 1 > month ||
    (today.getMonth() + 1 === month && today.getDate() >= day);
  const age = currentYear - year - (birthdayHasPassed ? 0 : 1);
  return age >= MINIMUM_AGE;
}
