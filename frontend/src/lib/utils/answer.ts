// Canonical answer normalization — digits <-> number-words <-> strings.
// Fixes spoken answers ("six", "6", 6) failing against numeric expectations.
const NUM_WORDS: Record<string, string> = {
  zero: '0', one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
  seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
  thirteen: '13', fourteen: '14', fifteen: '15', sixteen: '16', seventeen: '17',
  eighteen: '18', nineteen: '19', twenty: '20',
};

export function canonAnswer(v: unknown): string {
  let s = String(v ?? '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  s = s.split(' ').map((w) => NUM_WORDS[w] ?? w).join(' ');
  return s;
}

export function answersMatch(a: unknown, b: unknown): boolean {
  return canonAnswer(a) === canonAnswer(b);
}
