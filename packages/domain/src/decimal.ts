/**
 * Minimal exact decimal arithmetic for domain calculations.
 *
 * Values arrive as base-10 strings and are held as a BigInt coefficient plus
 * a decimal scale. This intentionally does not accept JavaScript numbers,
 * preventing binary floating-point values from entering monetary rules.
 */
export type DecimalString = string;

type ScaledDecimal = Readonly<{
  coefficient: bigint;
  scale: number;
}>;

const DECIMAL_PATTERN = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function parseDecimal(value: DecimalString): ScaledDecimal {
  const normalized = value.trim();
  if (!DECIMAL_PATTERN.test(normalized)) {
    throw new Error(`Invalid decimal value: ${value}`);
  }

  const sign = normalized.startsWith("-") ? -1n : 1n;
  const unsigned = normalized.replace(/^[+-]/, "");
  const [integerPart = "0", fractionalPart = ""] = unsigned.split(".");
  const digits = `${integerPart || "0"}${fractionalPart}`.replace(/^0+(?=\d)/, "");
  const coefficient = BigInt(digits || "0") * sign;

  return normalize({ coefficient, scale: fractionalPart.length });
}

export function decimalToString(value: ScaledDecimal): DecimalString {
  const normalized = normalize(value);
  if (normalized.scale === 0) {
    return normalized.coefficient.toString();
  }

  const negative = normalized.coefficient < 0n;
  const digits = (negative ? -normalized.coefficient : normalized.coefficient)
    .toString()
    .padStart(normalized.scale + 1, "0");
  const integerEnd = digits.length - normalized.scale;
  return `${negative ? "-" : ""}${digits.slice(0, integerEnd)}.${digits.slice(integerEnd)}`;
}

export function addDecimals(left: DecimalString, right: DecimalString): DecimalString {
  const [a, b, scale] = align(parseDecimal(left), parseDecimal(right));
  return decimalToString({ coefficient: a + b, scale });
}

export function subtractDecimals(left: DecimalString, right: DecimalString): DecimalString {
  const [a, b, scale] = align(parseDecimal(left), parseDecimal(right));
  return decimalToString({ coefficient: a - b, scale });
}

export function multiplyDecimals(left: DecimalString, right: DecimalString): DecimalString {
  const a = parseDecimal(left);
  const b = parseDecimal(right);
  return decimalToString({ coefficient: a.coefficient * b.coefficient, scale: a.scale + b.scale });
}

/** Compares two exact decimal strings without converting them to numbers. */
export function compareDecimals(left: DecimalString, right: DecimalString): -1 | 0 | 1 {
  const [a, b] = align(parseDecimal(left), parseDecimal(right));
  return a === b ? 0 : a < b ? -1 : 1;
}

/**
 * Divides with explicit decimal precision and half-away-from-zero rounding.
 * Domain callers choose the precision rather than inheriting a binary-float
 * approximation. Twelve decimal places is sufficient for current margin and
 * weighted-cost calculations until a business rounding policy is introduced.
 */
export function divideDecimals(
  dividend: DecimalString,
  divisor: DecimalString,
  decimalPlaces = 12,
): DecimalString {
  if (!Number.isSafeInteger(decimalPlaces) || decimalPlaces < 0) {
    throw new Error("decimalPlaces must be a non-negative safe integer");
  }

  const a = parseDecimal(dividend);
  const b = parseDecimal(divisor);
  if (b.coefficient === 0n) {
    throw new Error("Cannot divide by zero");
  }

  const numerator = a.coefficient * pow10(b.scale + decimalPlaces);
  const denominator = b.coefficient * pow10(a.scale);
  const sign = (numerator < 0n) === (denominator < 0n) ? 1n : -1n;
  const absoluteNumerator = numerator < 0n ? -numerator : numerator;
  const absoluteDenominator = denominator < 0n ? -denominator : denominator;
  let quotient = absoluteNumerator / absoluteDenominator;
  const remainder = absoluteNumerator % absoluteDenominator;

  if (remainder * 2n >= absoluteDenominator) {
    quotient += 1n;
  }

  return decimalToString({ coefficient: quotient * sign, scale: decimalPlaces });
}

function align(left: ScaledDecimal, right: ScaledDecimal): readonly [bigint, bigint, number] {
  const scale = Math.max(left.scale, right.scale);
  return [
    left.coefficient * pow10(scale - left.scale),
    right.coefficient * pow10(scale - right.scale),
    scale,
  ];
}

function normalize(value: ScaledDecimal): ScaledDecimal {
  if (value.coefficient === 0n) {
    return { coefficient: 0n, scale: 0 };
  }

  let coefficient = value.coefficient;
  let scale = value.scale;
  while (scale > 0 && coefficient % 10n === 0n) {
    coefficient /= 10n;
    scale -= 1;
  }
  return { coefficient, scale };
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}
