import { create } from 'zustand';
import { collectionApi } from '@/api/endpoints/collection';
import type { CollectionState } from '@/types/collection';

interface CollectionStore {
  state: CollectionState | null;
  isPolling: boolean;
  _intervalId: ReturnType<typeof setInterval> | null;
  _onCollectionDone: (() => void) | null;

  fetchState: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;
  onCollectionDone: (callback: (() => void) | null) => void;
}

export const useCollectionStore = create<CollectionStore>((set, get) => ({
  state: null,
  isPolling: false,
  _intervalId: null,
  _onCollectionDone: null,

  async fetchState() {
    try {
      const prevState = get().state;
      const data = await collectionApi.getState();
      set({ state: data });

      // Track collection (YouTrack fetch) and LLM separately
      const collectionActive = data.activeCollections.length > 0 || data.queue.length > 0;
      const llmActive = data.llmQueue.length > 0;
      const hasActive = collectionActive || llmActive;

      // Detect collection completion (even if LLM still processing)
      const wasCollectionActive = prevState && (
        prevState.activeCollections.length > 0 || prevState.queue.length > 0
      );
      if (wasCollectionActive && !collectionActive) {
        get()._onCollectionDone?.();
      }

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

  onCollectionDone(callback: (() => void) | null) {
    set({ _onCollectionDone: callback });
  },
}));
