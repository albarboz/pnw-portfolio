export interface SceneHandle {
  /** Kill timelines, ticker callbacks and listeners (used by Vite hot reload). */
  destroy(): void;
}
