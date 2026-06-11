import type { Passage } from "./passage-engine.js";

export interface VectorRetrievalClient {
  upsert(passages: Passage[], namespace: string): Promise<void>;
  query(queryText: string, topK: number, namespace?: string): Promise<Passage[]>;
  delete(namespace: string): Promise<void>;
}

class LocalVectorClient implements VectorRetrievalClient {
  private store = new Map<string, { passage: Passage; vector: Map<string, number> }>();

  async upsert(passages: Passage[], namespace: string): Promise<void> {
    for (const passage of passages) {
      this.store.set(`${namespace}::${passage.id}`, { passage, vector: this.embed(passage.text) });
    }
  }

  async query(queryText: string, topK: number, namespace?: string): Promise<Passage[]> {
    const queryVector = this.embed(queryText);
    return [...this.store.entries()]
      .filter(([key]) => !namespace || key.startsWith(`${namespace}::`))
      .map(([, value]) => ({ passage: value.passage, sim: this.cosine(queryVector, value.vector) }))
      .sort((a, b) => b.sim - a.sim)
      .slice(0, topK)
      .map((value) => value.passage);
  }

  async delete(namespace: string): Promise<void> {
    for (const key of this.store.keys()) {
      if (key.startsWith(`${namespace}::`)) this.store.delete(key);
    }
  }

  private embed(text: string): Map<string, number> {
    const freq = new Map<string, number>();
    for (const token of text.toLowerCase().split(/\W+/).filter((t) => t.length > 2)) {
      freq.set(token, (freq.get(token) ?? 0) + 1);
    }
    return freq;
  }

  private cosine(a: Map<string, number>, b: Map<string, number>): number {
    let dot = 0;
    let normA = 0;
    let normB = 0;
    for (const value of a.values()) normA += value ** 2;
    for (const value of b.values()) normB += value ** 2;
    for (const [token, value] of a) dot += value * (b.get(token) ?? 0);
    return dot / (Math.sqrt(normA) * Math.sqrt(normB) || 1);
  }
}

export const vectorClient: VectorRetrievalClient = new LocalVectorClient();
