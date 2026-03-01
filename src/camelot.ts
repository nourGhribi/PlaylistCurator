export type CamelotLetter = "A" | "B";
export type CamelotKey = `${number}${CamelotLetter}`;

export type KeyMode = 0 | 1;

export interface GetSongKeyParams {
  key_of: number;
  mode: KeyMode;
}

export const CAMELOT_TO_GETSONG_MAP: Record<string, GetSongKeyParams> = {
  "1A": { key_of: 8, mode: 0 },
  "1B": { key_of: 11, mode: 1 },
  "2A": { key_of: 3, mode: 0 },
  "2B": { key_of: 6, mode: 1 },
  "3A": { key_of: 10, mode: 0 },
  "3B": { key_of: 1, mode: 1 },
  "4A": { key_of: 5, mode: 0 },
  "4B": { key_of: 8, mode: 1 },
  "5A": { key_of: 0, mode: 0 },
  "5B": { key_of: 3, mode: 1 },
  "6A": { key_of: 7, mode: 0 },
  "6B": { key_of: 10, mode: 1 },
  "7A": { key_of: 2, mode: 0 },
  "7B": { key_of: 5, mode: 1 },
  "8A": { key_of: 9, mode: 0 },
  "8B": { key_of: 0, mode: 1 },
  "9A": { key_of: 4, mode: 0 },
  "9B": { key_of: 7, mode: 1 },
  "10A": { key_of: 11, mode: 0 },
  "10B": { key_of: 2, mode: 1 },
  "11A": { key_of: 6, mode: 0 },
  "11B": { key_of: 9, mode: 1 },
  "12A": { key_of: 1, mode: 0 },
  "12B": { key_of: 4, mode: 1 },
};

function wrapCamelotNumber(value: number): number {
  if (value < 1) {
    return 12;
  }
  if (value > 12) {
    return 1;
  }
  return value;
}

export function normalizeCamelotKey(input: string): string {
  return input.trim().toUpperCase();
}

export function isValidCamelotKey(input: string): boolean {
  return Boolean(CAMELOT_TO_GETSONG_MAP[normalizeCamelotKey(input)]);
}

export function getCompatibleCamelotKeys(camelotKey: string): string[] {
  const normalized = normalizeCamelotKey(camelotKey);
  const match = normalized.match(/^([1-9]|1[0-2])([AB])$/);
  if (!match) {
    throw new Error(`Invalid Camelot key: ${camelotKey}`);
  }

  const n = Number(match[1]);
  const letter = match[2] as CamelotLetter;
  const otherLetter: CamelotLetter = letter === "A" ? "B" : "A";

  const compatible = [
    `${n}${letter}`,
    `${wrapCamelotNumber(n - 1)}${letter}`,
    `${wrapCamelotNumber(n + 1)}${letter}`,
    `${n}${otherLetter}`,
  ];

  return Array.from(new Set(compatible));
}

export function getGetSongParamsForCamelot(camelotKey: string): GetSongKeyParams {
  const normalized = normalizeCamelotKey(camelotKey);
  const mapping = CAMELOT_TO_GETSONG_MAP[normalized];
  if (!mapping) {
    throw new Error(`Camelot key mapping not found for: ${camelotKey}`);
  }
  return mapping;
}
