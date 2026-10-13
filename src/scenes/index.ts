import { createDescentScene } from './descent';
import { createRunScene } from './run';
import type { SceneHandle } from './types';

/** Register every scene here, in page order. */
export function createScenes(): SceneHandle[] {
  return [createDescentScene(), createRunScene()].filter(
    (s): s is SceneHandle => s !== null,
  );
}
