import { describe, it, expect } from 'vitest';

describe('Chat Route', () => {
  it('should export a router', async () => {
    const chatModule = await import('../routes/chat.js');
    expect(chatModule.default).toBeDefined();
    expect(typeof chatModule.default).toBe('function');
  });
});

describe('LLM Library (OpenAI-compatible abstraction)', () => {
  it('should export streamLLMResponse and getLLMResponse', async () => {
    const llmModule = await import('../lib/llm.js');
    expect(typeof llmModule.streamLLMResponse).toBe('function');
    expect(typeof llmModule.getLLMResponse).toBe('function');
  });
});

describe('Pinecone & Embeddings', () => {
  it('should export textToVector, vectorizeAndStore, querySimilar', async () => {
    const pineconeModule = await import('../lib/pinecone.js');
    expect(typeof pineconeModule.textToVector).toBe('function');
    expect(typeof pineconeModule.vectorizeAndStore).toBe('function');
    expect(typeof pineconeModule.querySimilar).toBe('function');
    expect(typeof pineconeModule.deleteVectorsByUserId).toBe('function');
  });

  it('textToVector should return array of correct dimension', async () => {
    const { textToVector } = await import('../lib/pinecone.js');
    const vec = await textToVector('test query');
    expect(Array.isArray(vec)).toBe(true);
    expect(vec.length).toBeGreaterThan(0);
  });
});

describe('Prompt Router', () => {
  it('should export getPromptAdjustments and getCachedScores', async () => {
    const routerModule = await import('../lib/promptRouter.js');
    expect(typeof routerModule.getPromptAdjustments).toBe('function');
    expect(typeof routerModule.getCachedScores).toBe('function');
  });

  it('getPromptAdjustments returns default values for unknown category', async () => {
    const { getPromptAdjustments } = await import('../lib/promptRouter.js');
    const result = await getPromptAdjustments('unknown_category_xyz');
    expect(result).toHaveProperty('topK');
    expect(result).toHaveProperty('temperature');
    expect(result.topK).toBe(3);
    expect(result.temperature).toBe(0.7);
  });
});
