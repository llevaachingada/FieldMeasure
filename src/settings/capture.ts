/**
 * Camera AE/AF lock setting (owner request, session 28). Default `false`: a long-press on the
 * viewfinder does nothing unless the owner turns the lock on in Settings › Camera.
 * Same shape as `watermark.ts`; read by `CameraFlow` when it mounts.
 */
import { get, set } from 'idb-keyval';

export const DEFAULT_AE_AF_LOCK_ENABLED = false;

export const AE_AF_LOCK_KEY = 'fm:settings:aeAfLock';

export async function getAeAfLockEnabled(): Promise<boolean> {
  const stored = await get<boolean>(AE_AF_LOCK_KEY);
  return typeof stored === 'boolean' ? stored : DEFAULT_AE_AF_LOCK_ENABLED;
}

export async function setAeAfLockEnabled(value: boolean): Promise<void> {
  await set(AE_AF_LOCK_KEY, value);
}
