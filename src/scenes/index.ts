import { createDescentScene } from './descent';
import type { SceneHandle } from './types';

/** Register every scene here, in page order. */
export function createScenes(): SceneHandle[] {
  return [createDescentScene()].filter(
    (s): s is SceneHandle => s !== null,
  );
}
