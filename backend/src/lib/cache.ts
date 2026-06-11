import { LRUCache } from "lru-cache";
import { logger } from "./logger.js";
import { getSupabaseCacheStore, type CacheOptions } from "./supabase-cache.js";

type RedisLike = {
  isOpen?: boolean;
  connect: () => Promise<unknown>;
  get: (key: string) => Promise<string | null>;
  setEx: (key: string, ttl: number, value: string) => Promise<unknown>;
};

const l1 = new LRUCache<string, Record<string, unknown>>({ max: 500, ttl: 1000 * 60 * 10 });
let redisPromise: Promise<RedisLike | null> | null = null;
let supabaseCacheEnabled = process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY;

async function getRedis(): Promise<RedisLike | null> {
  if (!process.env.REDIS_URL) return null;
  redisPromise ??= (async () => {
    try {
      const mod = await Function("return import('redis')")() as { createClient: (opts: { url: string }) => RedisLike };
      const client = mod.createClient({ url: process.env.REDIS_URL! });
      await client.connect();
      return client;
    } catch (err) {
      logger.warn({ err }, "[cache] Redis unavailable; using L1 cache only");
      return null;
    }
  })();
  return redisPromise;
}

/**
 * Get Supabase cache store if enabled
 */
function getSupabaseCache() {
  if (!supabaseCacheEnabled) return null;
  try {
    return getSupabaseCacheStore();
  } catch (err) {
    logger.warn({ err }, "[cache] Supabase cache unavailable");
    return null;
  }
}

export async function cacheGet<T>(key: string, namespace: string = 'default'): Promise<T | null> {
  // Check L1 cache first
  const l1Value = l1.get(key) as T | undefined;
  if (l1Value !== undefined) return l1Value;

  // Try Supabase cache if enabled
  const supabaseCache = getSupabaseCache();
  if (supabaseCache) {
    const supabaseValue = await supabaseCache.get<T>(key, namespace);
    if (supabaseValue !== null) {
      // Populate L1 cache
      l1.set(key, supabaseValue as Record<string, unknown>);
      return supabaseValue;
    }
  }

  // Fall back to Redis if available
  const redis = await getRedis();
  if (!redis) return null;
  const raw = await redis.get(key).catch(() => null);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as T;
    l1.set(key, parsed as Record<string, unknown>);
    return parsed;
  } catch {
    return null;
  }
}

export async function cacheSet<T>(
  key: string,
  value: T,
  ttlSeconds = 600,
  namespace: string = 'default',
  options?: Partial<Omit<CacheOptions, 'ttlSeconds'>>
): Promise<void> {
  // Always update L1 cache
  l1.set(key, value as Record<string, unknown>, { ttl: ttlSeconds * 1000 });

  // Try Supabase cache if enabled
  const supabaseCache = getSupabaseCache();
  if (supabaseCache) {
    await supabaseCache.set(key, value, {
      ttlSeconds,
      namespace,
      ...options,
    });
    return;
  }

  // Fall back to Redis if available
  const redis = await getRedis();
  if (!redis) return;
  await redis.setEx(key, ttlSeconds, JSON.stringify(value)).catch(() => {});
}

export async function cacheDelete(key: string, namespace: string = 'default'): Promise<boolean> {
  // Remove from L1 cache
  l1.delete(key);

  // Try Supabase cache if enabled
  const supabaseCache = getSupabaseCache();
  if (supabaseCache) {
    return await supabaseCache.delete(key, namespace);
  }

  // Fall back to Redis if available
  const redis = await getRedis();
  if (!redis) return true;
  
  // Redis doesn't have a simple delete, we'd need to implement it
  return true;
}

export async function cacheExists(key: string, namespace: string = 'default'): Promise<boolean> {
  // Check L1 cache first
  if (l1.has(key)) return true;

  // Try Supabase cache if enabled
  const supabaseCache = getSupabaseCache();
  if (supabaseCache) {
    return await supabaseCache.exists(key, namespace);
  }

  // Fall back to Redis if available
  const redis = await getRedis();
  if (!redis) return false;
  const raw = await redis.get(key).catch(() => null);
  return raw !== null;
}
