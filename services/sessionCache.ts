import { clearSyncQueueCache } from '@/services/syncService';
import { clearLocalLibrary } from '@/utils/bookRepository';
import { clearTransientDtoMap } from '@/utils/transientDtoMap';
import exploreCache from '@/utils/exploreCache';

// Clears user-scoped caches and local persisted library on logout.
export const clearUserSessionCache = async () => {
  clearTransientDtoMap();

  try {
    await clearLocalLibrary();
  } catch (error) {
    console.warn('Failed to clear local library on logout:', error);
  }

  try {
    await clearSyncQueueCache();
  } catch (error) {
    console.warn('Failed to clear sync queue cache on logout:', error);
  }

  try {
    await exploreCache.clearAllCache();
  } catch (error) {
    console.warn('Failed to clear explore cache on logout:', error);
  }
};
