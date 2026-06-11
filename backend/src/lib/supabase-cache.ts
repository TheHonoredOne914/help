import { getSupabaseClient } from '../db.js';
import { logger } from './logger.js';

export interface CacheEntry<T = unknown> {
  id?: number;
  namespace: string;
  key: string;
  value_jsonb: T;
  created_at?: string;
  expires_at: string;
  source_hash?: string | null;
  agenda_fingerprint?: string | null;
  mode?: string | null;
  run_tags?: Record<string, unknown> | null;
}

export interface CacheOptions {
  ttlSeconds: number;
  namespace?: string;
  sourceHash?: string;
  agendaFingerprint?: string;
  mode?: string;
  runTags?: Record<string, unknown>;
}

/**
 * Supabase-backed cache store for persistent caching
 */
export class SupabaseCacheStore {
  private readonly tableName = 'cache_entries';

  /**
   * Get a cached value by key and namespace
   */
  async get<T>(key: string, namespace: string = 'default'): Promise<T | null> {
    try {
      const supabase = getSupabaseClient();
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from(this.tableName)
        .select('*')
        .eq('namespace', namespace)
        .eq('key', key)
        .gt('expires_at', now)
        .single();

      if (error && error.code !== 'PGRST116') {
        logger.warn({ err: error, key, namespace }, '[SupabaseCache] Get error');
        return null;
      }

      if (!data) {
        return null;
      }

      return data.value_jsonb as T;
    } catch (err) {
      logger.warn({ err, key, namespace }, '[SupabaseCache] Get failed');
      return null;
    }
  }

  /**
   * Set a cached value with TTL
   */
  async set<T>(
    key: string,
    value: T,
    options: CacheOptions,
    namespace: string = 'default'
  ): Promise<void> {
    try {
      const supabase = getSupabaseClient();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + options.ttlSeconds * 1000).toISOString();

      const entry: Omit<CacheEntry<T>, 'id'> = {
        namespace,
        key,
        value_jsonb: value,
        expires_at: expiresAt,
        source_hash: options.sourceHash ?? null,
        agenda_fingerprint: options.agendaFingerprint ?? null,
        mode: options.mode ?? null,
        run_tags: options.runTags ?? null,
      };

      const { error } = await supabase
        .from(this.tableName)
        .upsert(entry, { onConflict: 'namespace,key' })
        .select();

      if (error) {
        logger.warn({ err: error, key, namespace }, '[SupabaseCache] Set error');
      } else {
        logger.debug({ key, namespace, ttlSeconds: options.ttlSeconds }, '[SupabaseCache] Set success');
      }
    } catch (err) {
      logger.warn({ err, key, namespace }, '[SupabaseCache] Set failed');
    }
  }

  /**
   * Delete a cached value
   */
  async delete(key: string, namespace: string = 'default'): Promise<boolean> {
    try {
      const supabase = getSupabaseClient();

      const { error } = await supabase
        .from(this.tableName)
        .delete()
        .eq('namespace', namespace)
        .eq('key', key);

      if (error) {
        logger.warn({ err: error, key, namespace }, '[SupabaseCache] Delete error');
        return false;
      }

      logger.debug({ key, namespace }, '[SupabaseCache] Delete success');
      return true;
    } catch (err) {
      logger.warn({ err, key, namespace }, '[SupabaseCache] Delete failed');
      return false;
    }
  }

  /**
   * Check if a key exists and is not expired
   */
  async exists(key: string, namespace: string = 'default'): Promise<boolean> {
    try {
      const supabase = getSupabaseClient();
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from(this.tableName)
        .select('id')
        .eq('namespace', namespace)
        .eq('key', key)
        .gt('expires_at', now)
        .limit(1)
        .single();

      if (error && error.code !== 'PGRST116') {
        return false;
      }

      return !!data;
    } catch {
      return false;
    }
  }

  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<number> {
    try {
      const supabase = getSupabaseClient();
      const now = new Date().toISOString();

      const { data, error } = await supabase
        .from(this.tableName)
        .select('id', { count: 'exact' })
        .lt('expires_at', now);

      if (error) {
        logger.warn({ err: error }, '[SupabaseCache] Cleanup query error');
        return 0;
      }

      const count = data?.length ?? 0;
      if (count === 0) {
        return 0;
      }

      const { error: deleteError } = await supabase
        .from(this.tableName)
        .delete()
        .lt('expires_at', now);

      if (deleteError) {
        logger.warn({ err: deleteError }, '[SupabaseCache] Cleanup delete error');
        return 0;
      }

      logger.info({ deletedCount: count }, '[SupabaseCache] Cleanup completed');
      return count;
    } catch (err) {
      logger.warn({ err }, '[SupabaseCache] Cleanup failed');
      return 0;
    }
  }

  /**
   * Get cache statistics
   */
  async stats(namespace?: string): Promise<{ total: number; expired: number }> {
    try {
      const supabase = getSupabaseClient();
      const now = new Date().toISOString();

      let totalQuery = supabase.from(this.tableName).select('*', { count: 'exact', head: true });
      let expiredQuery = supabase.from(this.tableName).select('*', { count: 'exact', head: true }).lt('expires_at', now);

      if (namespace) {
        totalQuery = totalQuery.eq('namespace', namespace);
        expiredQuery = expiredQuery.eq('namespace', namespace);
      }

      const [{ count: total }, { count: expired }] = await Promise.all([
        totalQuery,
        expiredQuery,
      ]);

      return {
        total: total ?? 0,
        expired: expired ?? 0,
      };
    } catch (err) {
      logger.warn({ err }, '[SupabaseCache] Stats failed');
      return { total: 0, expired: 0 };
    }
  }
}

// Singleton instance
let _supabaseCacheStore: SupabaseCacheStore | null = null;

export function getSupabaseCacheStore(): SupabaseCacheStore {
  if (!_supabaseCacheStore) {
    _supabaseCacheStore = new SupabaseCacheStore();
  }
  return _supabaseCacheStore;
}
