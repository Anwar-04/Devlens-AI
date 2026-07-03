export const EMBEDDING_DIMENSIONS = 128;

const TOKEN_PATTERN = /[a-zA-Z0-9_.$/-]+/g;

function hashToken(token: string): number {
  let hash = 2166136261;
  for (let index = 0; index < token.length; index += 1) {
    hash ^= token.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function tokenize(value: string): string[] {
  return value.toLowerCase().match(TOKEN_PATTERN) ?? [];
}

export function generateEmbedding(value: string): number[] {
  const vector = Array.from({ length: EMBEDDING_DIMENSIONS }, () => 0);
  const tokens = tokenize(value);

  for (const token of tokens) {
    const hash = hashToken(token);
    const index = hash % EMBEDDING_DIMENSIONS;
    const sign = hash & 1 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign;
  }

  const magnitude = Math.sqrt(
    vector.reduce((sum, item) => sum + item * item, 0),
  );
  if (magnitude === 0) return vector;
  return vector.map((item) => Number((item / magnitude).toFixed(6)));
}
