/**
 * Runs an action without awaiting it. App already shows the banner or the
 * token screen when the action fails, so the caller only has to not crash.
 */
export function fire(p: Promise<unknown> | void): void {
  void Promise.resolve(p).catch(() => {});
}
