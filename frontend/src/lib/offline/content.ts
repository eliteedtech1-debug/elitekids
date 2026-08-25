/**
 * Offline content manager — EliteKids offline mode.
 *
 * Pre-downloads game configs and lesson metadata so children can play
 * fully offline. Content is cached per-school with TTL-based invalidation.
 *
 * Usage:
 *   import { offlineContent } from '@/lib/offline/content';
 *   await offlineContent.prefetchLesson('lesson-123');
 *   const config = await offlineContent.getGameConfig('game-123');
 *   const available = await offlineContent.listAvailableOffline();
 */

import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { offlineDB, STORES } from './db';
import { canPrefetch } from '@/lib/utils/storage-budget';

/** Cache TTL: 24 hours in milliseconds. */
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/** Freshness window for kid-facing offline caches (catalog, games): 7 days. */
const OFFLINE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const CATALOG_KEY = '__catalog__';

export interface LessonCardLike {
  id: string;
  title: string;
  subject?: string;
  age_level?: string;
  lesson_type?: string;
  created_at?: string;
  has_games?: boolean;
  [key: string]: unknown;
}

interface CachedGameConfig {
  id: string;
  config: unknown;
  cachedAt: number;
  schoolId: string;
}

interface CachedLesson {
  id: string;
  title: string;
  subject: string;
  age_level: string;
  lesson_type: string;
  has_games: boolean;
  cachedAt: number;
  schoolId: string;
}

class OfflineContentManager {
  /**
   * Pre-download a lesson's game config and scene scripts for offline play.
   * Returns true if cached successfully.
   */
  async prefetchLesson(lessonId: string, schoolId: string): Promise<boolean> {
    // #6 storage budget: never prefetch past the device quota.
    if (!(await canPrefetch())) {
      console.warn('⚠️ Storage budget reached — skipping prefetch of lesson', lessonId);
      return false;
    }
    try {
      // Fetch game config
      const gameRes = await apiClient.get(ENDPOINTS.LESSONS.GAME(lessonId));
      const gameConfig = gameRes.data?.data || gameRes.data;
      if (gameConfig?.template) {
        await offlineDB.put<CachedGameConfig>(STORES.gameConfigs, lessonId, {
          id: lessonId,
          config: gameConfig,
          cachedAt: Date.now(),
          schoolId,
        });
      }

      // Fetch scene scripts
      const scenesRes = await apiClient.get(ENDPOINTS.LESSONS.SCENES(lessonId));
      const scenes = scenesRes.data?.data || scenesRes.data;
      if (scenes) {
        await offlineDB.put(STORES.gameConfigs, `${lessonId}-scenes`, {
          id: `${lessonId}-scenes`,
          config: scenes,
          cachedAt: Date.now(),
          schoolId,
        });
      }

      return true;
    } catch (err: any) {
      console.warn(`⚠️ Failed to prefetch lesson ${lessonId}:`, err?.message);
      return false;
    }
  }

  /**
   * Prefetch all published lessons for a school.
   * Returns the number of lessons cached.
   */
  async prefetchAll(schoolId: string): Promise<number> {
    try {
      const res = await apiClient.get(ENDPOINTS.LESSONS.LIST, {
        params: { content_state: 'published' },
      });
      const lessons = res.data?.data || [];

      // Cache lesson metadata (small — but still respect the budget)
      for (const lesson of lessons) {
        if (!(await canPrefetch())) break;
        await offlineDB.put<CachedLesson>(STORES.lessons, lesson.id, {
          id: lesson.id,
          title: lesson.title,
          subject: lesson.subject,
          age_level: lesson.age_level,
          lesson_type: lesson.lesson_type,
          has_games: lesson.has_games,
          cachedAt: Date.now(),
          schoolId,
        });
      }

      // Prefetch game configs in parallel (max 5 at a time), checking the
      // quota guard between batches so we never exceed the device budget.
      const gameLessons = lessons.filter((l: any) => l.has_games);
      const batchSize = 5;
      for (let i = 0; i < gameLessons.length; i += batchSize) {
        if (!(await canPrefetch())) {
          console.warn('⚠️ Storage budget reached — stopping game config prefetch');
          break;
        }
        const batch = gameLessons.slice(i, i + batchSize);
        await Promise.allSettled(
          batch.map((l: any) => this.prefetchLesson(l.id, schoolId))
        );
      }

      return lessons.length;
    } catch (err: any) {
      console.warn('⚠️ Failed to prefetch all lessons:', err?.message);
      return 0;
    }
  }

  /**
   * Get a cached game config for offline play.
   * Returns null if not cached or expired.
   */
  async getGameConfig(lessonId: string): Promise<unknown | null> {
    const cached = await offlineDB.get<CachedGameConfig>(STORES.gameConfigs, lessonId);
    if (!cached) return null;

    // Check TTL
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
      await offlineDB.delete(STORES.gameConfigs, lessonId);
      return null;
    }

    return cached.config;
  }

  /**
   * Get cached scene scripts for a lesson.
   */
  async getScenes(lessonId: string): Promise<unknown | null> {
    const cached = await offlineDB.get<CachedGameConfig>(STORES.gameConfigs, `${lessonId}-scenes`);
    if (!cached) return null;
    if (Date.now() - cached.cachedAt > CACHE_TTL_MS) {
      await offlineDB.delete(STORES.gameConfigs, `${lessonId}-scenes`);
      return null;
    }
    return cached.config;
  }

  /**
   * Get cached lesson metadata.
   */
  async getLesson(lessonId: string): Promise<CachedLesson | null> {
    return offlineDB.get<CachedLesson>(STORES.lessons, lessonId);
  }

  /**
   * List all lessons available offline.
   */
  async listAvailableOffline(): Promise<CachedLesson[]> {
    const entries = await offlineDB.getAll<CachedLesson>(STORES.lessons);
    const now = Date.now();
    return entries
      .map((e) => e.value)
      .filter((lesson) => now - lesson.cachedAt <= CACHE_TTL_MS);
  }

  /**
   * Check if a specific lesson is available offline.
   */
  async isAvailableOffline(lessonId: string): Promise<boolean> {
    const config = await this.getGameConfig(lessonId);
    return config !== null;
  }

  /**
   * Save the published-games catalog so the dashboard renders offline
   * instead of an empty "All Games(0)" shell.
   */
  async saveCatalog(lessons: LessonCardLike[]): Promise<boolean> {
    if (!Array.isArray(lessons) || lessons.length === 0) return false;
    return offlineDB.put(STORES.gameConfigs, CATALOG_KEY, {
      lessons,
      cachedAt: Date.now(),
    });
  }

  /**
   * Load the cached catalog (7-day freshness).
   * Returns null when missing, expired, or IndexedDB unavailable.
   */
  async loadCatalog(): Promise<LessonCardLike[] | null> {
    const entry = await offlineDB.get<{ lessons: LessonCardLike[]; cachedAt: number }>(
      STORES.gameConfigs,
      CATALOG_KEY
    );
    if (!entry?.lessons || entry.lessons.length === 0) return null;
    if (Date.now() - entry.cachedAt > OFFLINE_TTL_MS) return null;
    return entry.lessons;
  }

  /**
   * Save a lesson's full game payload (same shape GET /kids/lessons/:id/game
   * returns) right after a successful online fetch, for later offline play.
   */
  async saveGamePayload(lessonId: string, gameData: unknown): Promise<boolean> {
    if (!gameData || typeof gameData !== 'object') return false;
    return offlineDB.put(STORES.gameConfigs, `game-${lessonId}`, {
      gameData,
      cachedAt: Date.now(),
    });
  }

  /** Load a cached game payload for offline play (7-day freshness). */
  async loadGamePayload(lessonId: string): Promise<unknown | null> {
    const entry = await offlineDB.get<{ gameData: unknown; cachedAt: number }>(
      STORES.gameConfigs,
      `game-${lessonId}`
    );
    if (!entry?.gameData) return null;
    if (Date.now() - entry.cachedAt > OFFLINE_TTL_MS) return null;
    return entry.gameData;
  }

  /** Save a lesson's scene scripts for offline intro playback. */
  async saveScenes(lessonId: string, sceneData: unknown): Promise<boolean> {
    if (!Array.isArray(sceneData) || sceneData.length === 0) return false;
    return offlineDB.put(STORES.gameConfigs, `scenes-${lessonId}`, {
      sceneData,
      cachedAt: Date.now(),
    });
  }

  /** Load cached scene scripts (7-day freshness). */
  async loadScenes(lessonId: string): Promise<unknown | null> {
    const entry = await offlineDB.get<{ sceneData: unknown; cachedAt: number }>(
      STORES.gameConfigs,
      `scenes-${lessonId}`
    );
    if (!entry?.sceneData) return null;
    if (Date.now() - entry.cachedAt > OFFLINE_TTL_MS) return null;
    return entry.sceneData;
  }

  /** Save a child's progress summary so XP/stars render offline. */
  async saveProgress(admissionNo: string, progress: unknown): Promise<boolean> {
    if (!admissionNo || !progress) return false;
    return offlineDB.put(STORES.gameConfigs, `progress-${admissionNo}`, {
      progress,
      cachedAt: Date.now(),
    });
  }

  /** Load a cached progress summary (24h freshness). */
  async loadProgress(admissionNo: string): Promise<unknown | null> {
    const entry = await offlineDB.get<{ progress: unknown; cachedAt: number }>(
      STORES.gameConfigs,
      `progress-${admissionNo}`
    );
    if (!entry?.progress) return null;
    if (Date.now() - entry.cachedAt > CACHE_TTL_MS) return null;
    return entry.progress;
  }

  /**
   * Clear all cached content (factory reset).
   */
  async clearCache(): Promise<void> {
    await offlineDB.clearStore(STORES.gameConfigs);
    await offlineDB.clearStore(STORES.lessons);
  }

  /**
   * Get cache stats — total items cached, total size estimate.
   */
  async getCacheStats(): Promise<{ lessons: number; gameConfigs: number; totalSizeKB: number }> {
    const lessons = await offlineDB.getAll(STORES.lessons);
    const configs = await offlineDB.getAll(STORES.gameConfigs);

    // Rough size estimate (JSON serialization)
    let totalBytes = 0;
    for (const item of configs) {
      totalBytes += JSON.stringify(item).length * 2; // UTF-16
    }

    return {
      lessons: lessons.length,
      gameConfigs: configs.length,
      totalSizeKB: Math.round(totalBytes / 1024),
    };
  }
}

/** Singleton — import and use directly. */
export const offlineContent = new OfflineContentManager();
