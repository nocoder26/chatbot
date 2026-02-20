import { describe, it, expect } from 'vitest';

describe('Bloodwork Route', () => {
  it('should export a router', async () => {
    const bloodworkModule = await import('../routes/bloodwork.js');
    expect(bloodworkModule.default).toBeDefined();
    expect(typeof bloodworkModule.default).toBe('function');
  });
});

describe('Pinecone Library', () => {
  it('should export vectorizeAndStore function', async () => {
    const pineconeModule = await import('../lib/pinecone.js');
    expect(typeof pineconeModule.vectorizeAndStore).toBe('function');
  });

  it('should export querySimilar function', async () => {
    const pineconeModule = await import('../lib/pinecone.js');
    expect(typeof pineconeModule.querySimilar).toBe('function');
  });

  it('vectorizeAndStore should not throw when Pinecone is not configured', async () => {
    const pineconeModule = await import('../lib/pinecone.js');
    await expect(
      pineconeModule.vectorizeAndStore('test-user', 'chat_message', 'test content')
    ).resolves.not.toThrow();
  });
});

describe('Username Generator', () => {
  it('should export generatePositiveUsernames', async () => {
    const usernamesModule = await import('../lib/usernames.js');
    expect(typeof usernamesModule.generatePositiveUsernames).toBe('function');
  });

  it('should return an array of usernames', async () => {
    const usernamesModule = await import('../lib/usernames.js');
    const usernames = usernamesModule.generatePositiveUsernames();
    expect(Array.isArray(usernames)).toBe(true);
    expect(usernames.length).toBeGreaterThan(0);
    usernames.forEach((name) => {
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    });
  });
});
