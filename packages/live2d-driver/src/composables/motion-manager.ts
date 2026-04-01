// NOTICE: The full AIRI motion-manager migration is deferred to the next
// implementation slice. This placeholder keeps the live2d-driver package
// shape stable while the driver contract is wired into the Electron shell.
export interface Live2DMotionManager {
  tick(now: number): void
}

export function createLive2DMotionManager(): Live2DMotionManager {
  return {
    tick() {},
  }
}
