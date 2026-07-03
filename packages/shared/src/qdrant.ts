import { EMBEDDING_DIMENSIONS } from "./embeddings.js";

export const KNOWLEDGE_COLLECTION = "devlens_knowledge_chunks";

export interface QdrantPoint {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
}

export interface QdrantSearchHit {
  id: string;
  score: number;
  payload?: Record<string, unknown>;
}

function buildUrl(qdrantUrl: string, path: string): string {
  return `${qdrantUrl.replace(/\/$/, "")}${path}`;
}

async function qdrantRequest<T>(
  qdrantUrl: string,
  path: string,
  init: RequestInit,
  options: { allowConflict?: boolean } = {},
): Promise<T> {
  const response = await fetch(buildUrl(qdrantUrl, path), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 409 && options.allowConflict) {
    return {} as T;
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Qdrant request failed (${response.status}): ${body}`);
  }

  return (await response.json()) as T;
}

export async function ensureKnowledgeCollection(
  qdrantUrl: string,
): Promise<void> {
  await qdrantRequest(
    qdrantUrl,
    `/collections/${KNOWLEDGE_COLLECTION}`,
    {
      method: "PUT",
      body: JSON.stringify({
        vectors: {
          size: EMBEDDING_DIMENSIONS,
          distance: "Cosine",
        },
      }),
    },
    { allowConflict: true },
  );
}

export async function upsertKnowledgePoints(
  qdrantUrl: string,
  points: QdrantPoint[],
): Promise<void> {
  if (points.length === 0) return;
  await ensureKnowledgeCollection(qdrantUrl);
  await qdrantRequest(
    qdrantUrl,
    `/collections/${KNOWLEDGE_COLLECTION}/points?wait=true`,
    {
      method: "PUT",
      body: JSON.stringify({ points }),
    },
  );
}

export async function searchKnowledgePoints({
  qdrantUrl,
  repositoryId,
  vector,
  limit,
}: {
  qdrantUrl: string;
  repositoryId: string;
  vector: number[];
  limit: number;
}): Promise<QdrantSearchHit[]> {
  await ensureKnowledgeCollection(qdrantUrl);
  const response = await qdrantRequest<{
    result: Array<{
      id: string | number;
      score: number;
      payload?: Record<string, unknown>;
    }>;
  }>(qdrantUrl, `/collections/${KNOWLEDGE_COLLECTION}/points/search`, {
    method: "POST",
    body: JSON.stringify({
      vector,
      limit,
      with_payload: true,
      filter: {
        must: [{ key: "repositoryId", match: { value: repositoryId } }],
      },
    }),
  });

  return response.result.map((hit) => ({
    id: String(hit.id),
    score: hit.score,
    payload: hit.payload,
  }));
}
