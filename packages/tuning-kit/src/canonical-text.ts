/** Compares NFC-normalized Unicode code points without locale/ICU variance. */
export function compareCanonicalText(left: string, right: string) {
  const leftPoints = [...left.normalize("NFC")].map(
    (value) => value.codePointAt(0) ?? 0,
  );
  const rightPoints = [...right.normalize("NFC")].map(
    (value) => value.codePointAt(0) ?? 0,
  );
  const length = Math.min(leftPoints.length, rightPoints.length);
  for (let index = 0; index < length; index += 1) {
    const leftPoint = leftPoints[index] ?? 0;
    const rightPoint = rightPoints[index] ?? 0;
    if (leftPoint !== rightPoint) return leftPoint - rightPoint;
  }
  return leftPoints.length - rightPoints.length;
}

export function stableTextHash(value: string) {
  let hash = 2_166_136_261;
  for (const character of value) {
    hash ^= character.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}
