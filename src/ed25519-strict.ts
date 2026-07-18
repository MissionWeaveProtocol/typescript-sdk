const FIELD = (1n << 255n) - 19n;
export const ED25519_ORDER =
  (1n << 252n) + 27742317777372353535851937790883648493n;
const D = mod(-121665n * inverse(121666n));
const SQRT_MINUS_ONE = powMod(2n, (FIELD - 1n) / 4n);
const IDENTITY: Point = [0n, 1n, 1n, 0n];

type Point = readonly [bigint, bigint, bigint, bigint];

export function assertStrictEd25519Point(
  encoded: Uint8Array,
  options: { readonly allowIdentity: boolean; readonly label: string },
): void {
  if (encoded.length !== 32) {
    throw new TypeError(`${options.label} must encode a 32-byte Ed25519 point`);
  }
  const compressed = littleEndianInteger(encoded);
  const xSign = compressed >> 255n;
  const y = compressed & ((1n << 255n) - 1n);
  if (y >= FIELD) {
    throw new TypeError(`${options.label} is not canonically encoded`);
  }

  const ySquared = mod(y * y);
  const numerator = mod(ySquared - 1n);
  const denominator = mod(D * ySquared + 1n);
  const xSquared = mod(numerator * inverse(denominator));
  let x = powMod(xSquared, (FIELD + 3n) / 8n);
  if (mod(x * x - xSquared) !== 0n) x = mod(x * SQRT_MINUS_ONE);
  if (mod(x * x - xSquared) !== 0n) {
    throw new TypeError(`${options.label} is not on Edwards25519`);
  }
  if (x === 0n && xSign === 1n) {
    throw new TypeError(`${options.label} uses negative-zero encoding`);
  }
  if ((x & 1n) !== xSign) x = FIELD - x;

  const point: Point = [x, y, 1n, mod(x * y)];
  if (isIdentity(point) && !options.allowIdentity) {
    throw new TypeError(`${options.label} encodes the identity point`);
  }
  if (!isIdentity(scalarMultiply(point, ED25519_ORDER))) {
    throw new TypeError(`${options.label} is not in the prime-order subgroup`);
  }
}

export function littleEndianInteger(value: Uint8Array): bigint {
  let result = 0n;
  for (let index = value.length - 1; index >= 0; index -= 1) {
    result = (result << 8n) | BigInt(value[index] ?? 0);
  }
  return result;
}

function add(left: Point, right: Point): Point {
  const [x1, y1, z1, t1] = left;
  const [x2, y2, z2, t2] = right;
  const a = mod((y1 - x1) * (y2 - x2));
  const b = mod((y1 + x1) * (y2 + x2));
  const c = mod(2n * D * t1 * t2);
  const d = mod(2n * z1 * z2);
  const e = mod(b - a);
  const f = mod(d - c);
  const g = mod(d + c);
  const h = mod(b + a);
  return [mod(e * f), mod(g * h), mod(f * g), mod(e * h)];
}

function scalarMultiply(point: Point, scalar: bigint): Point {
  let result = IDENTITY;
  let addend = point;
  let remaining = scalar;
  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) result = add(result, addend);
    addend = add(addend, addend);
    remaining >>= 1n;
  }
  return result;
}

function isIdentity(point: Point): boolean {
  const [x, y, z] = point;
  return mod(x) === 0n && mod(y - z) === 0n;
}

function inverse(value: bigint): bigint {
  return powMod(value, FIELD - 2n);
}

function powMod(base: bigint, exponent: bigint): bigint {
  let result = 1n;
  let factor = mod(base);
  let remaining = exponent;
  while (remaining > 0n) {
    if ((remaining & 1n) === 1n) result = mod(result * factor);
    factor = mod(factor * factor);
    remaining >>= 1n;
  }
  return result;
}

function mod(value: bigint): bigint {
  const result = value % FIELD;
  return result >= 0n ? result : result + FIELD;
}
