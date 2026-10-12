import { createDescentScene } from './descent';
import type { SceneHandle } from './types';
import type { Altimeter } from '../ui/altimeter';

/** Register every scene here, in page order. */
export function createScenes(altimeter: Altimeter): SceneHandle[] {
  return [createDescentScene({ onProgress: altimeter.fromDescent })].filter(
    (s): s is SceneHandle => s !== null,
  );
}
