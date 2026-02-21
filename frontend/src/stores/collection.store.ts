import { create } from 'zustand';
import { collectionApi } from '@/api/endpoints/collection';
import type { CollectionState } from '@/types/collection';

interface CollectionStore {
  state: CollectionState | null;
  isPolling: boolean;
  _intervalId: ReturnType<typeof setInterval> | null;

  fetchState: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
}

export const useCollectionStore = create<CollectionStore>((set, get) => ({
  state: null,
  isPolling: false,
  _intervalId: null,

  async fetchState() {
    try {
      const data = await collectionApi.getState();
      set({ state: data });

      const hasActive = data.activeCollections.length > 0 || data.queue.length > 0;
      if (hasActive && !get().isPolling) {
        get().startPolling();
      } else if (!hasActive && get().isPolling) {
        get().stopPolling();
      }
    } catch {
      // Errors handled by API interceptor
    }
  },

  startPolling() {
    if (get().isPolling) return;
    const intervalId = setInterval(() => {
      get().fetchState();
    }, 3000);
    set({ isPolling: true, _intervalId: intervalId });
  },

  stopPolling() {
    const intervalId = get()._intervalId;
    if (intervalId) {
      clearInterval(intervalId);
    }
    set({ isPolling: false, _intervalId: null });
  },
}));
