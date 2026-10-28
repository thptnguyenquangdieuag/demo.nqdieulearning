/** Disabled in SUPABASE-ONLY mode. There is no offline/local persistence queue. */
export type SyncQueueItem = any;
export function getSyncQueue(): SyncQueueItem[] { return []; }
export function getSyncQueueCount(): number { return 0; }
export function hasPendingQueue(): boolean { return false; }
export function enqueueSyncItem(..._args: any[]): void {}
export function clearSyncQueue(): void {}
export function removeSyncItem(..._args: any[]): void {}
export async function processSyncQueue(): Promise<void> {}
