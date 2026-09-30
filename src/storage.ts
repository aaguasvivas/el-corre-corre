// storage.ts: a native backup of the game's saves. Every save lives in
// localStorage under ecc.v1.* (records, the plátano wallet, pinturas,
// mandaos, the streak, the ride, language, mute). Inside the iOS wrap that
// is WKWebView storage, which the OS may reclaim; Capacitor Preferences
// (UserDefaults) is not. So on native the whole ecc.v1.* set is mirrored
// into one Preferences entry, and a boot that finds localStorage empty
// brings it back before the game reads anything. Every module keeps reading
// and writing localStorage exactly as before; the web never touches this.
//
// When the mirror is written: at the end of every run, on pause, and when
// the app goes to the background (see main.ts). A boot that already has
// saves also writes it once, so the first launch after an update is covered.

import { Capacitor } from '@capacitor/core';
import { Preferences } from '@capacitor/preferences';

export const SAVE_PREFIX = 'ecc.v1.';
// The Preferences entry holding the mirror: JSON { v: 1, saves: { key: value } }.
export const BACKUP_KEY = 'ecc.backup';
// A native bridge that never answers must not hold the title screen hostage:
// past this the game boots with whatever localStorage has.
export const RESTORE_TIMEOUT_MS = 1500;

// What the mirror needs from Preferences (a fake in the tests).
export interface BackupStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

// What it needs from localStorage.
export type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'key' | 'length'>;

// Every ecc.v1.* key and its value.
export function snapshotSaves(ls: SaveStorage): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < ls.length; i++) {
    const k = ls.key(i);
    if (k === null || !k.startsWith(SAVE_PREFIX)) continue;
    const v = ls.getItem(k);
    if (v !== null) out[k] = v;
  }
  return out;
}

export function hasSaves(ls: SaveStorage): boolean {
  for (let i = 0; i < ls.length; i++) {
    if (ls.key(i)?.startsWith(SAVE_PREFIX)) return true;
  }
  return false;
}

// Bring the mirror back into an empty localStorage. Returns how many keys
// came back. Saves already present always win: a mirror is only ever used
// to refill storage the OS wiped, never to overwrite newer play. `wanted`
// is asked again once the store answers: a late answer, after the game has
// booted without it, must not land under a running game.
export async function restoreFrom(
  ls: SaveStorage,
  store: BackupStore,
  wanted: () => boolean = () => true,
): Promise<number> {
  if (hasSaves(ls)) return 0;
  const raw = await store.get(BACKUP_KEY);
  if (raw === null || !wanted() || hasSaves(ls)) return 0;
  let saves: unknown;
  try {
    saves = (JSON.parse(raw) as { saves?: unknown }).saves;
  } catch {
    return 0; // a corrupt mirror is no mirror
  }
  if (typeof saves !== 'object' || saves === null) return 0;
  let n = 0;
  for (const [k, v] of Object.entries(saves)) {
    if (!k.startsWith(SAVE_PREFIX) || typeof v !== 'string') continue;
    ls.setItem(k, v);
    n++;
  }
  return n;
}

// Mirror every ecc.v1.* key. `last` is the JSON written last time: an
// unchanged set is not written again, and an empty one never is (a player
// with no saves has nothing to lose, and an empty write would wipe a good
// mirror). Returns the JSON the store now holds, as far as we know.
export async function backupTo(ls: SaveStorage, store: BackupStore, last: string | null): Promise<string | null> {
  const saves = snapshotSaves(ls);
  if (Object.keys(saves).length === 0) return last;
  const json = JSON.stringify({ v: 1, saves });
  if (json !== last) await store.set(BACKUP_KEY, json);
  return json;
}

// One mirror between a localStorage and a store, with the boot-time rules.
export class SaveMirror {
  private last: string | null = null;
  private chain: Promise<void> = Promise.resolve();
  // Backups start only once the boot has read the mirror. A session that
  // could not read it (a bridge that timed out or threw) never writes it
  // either, so it cannot bury the saves it failed to bring back under a
  // fresh run's.
  private read = false;

  constructor(
    private readonly ls: () => SaveStorage,
    private readonly store: BackupStore,
    private readonly timeoutMs = RESTORE_TIMEOUT_MS,
  ) {}

  // Resolves once localStorage holds whatever the mirror could give back,
  // or after timeoutMs, whichever is first. Never rejects.
  restore(): Promise<void> {
    let late = false;
    const restore = (async () => restoreFrom(this.ls(), this.store, () => !late))().then(
      () => true,
      () => false,
    );
    const timeout = new Promise<boolean>((resolve) => setTimeout(() => resolve(false), this.timeoutMs));
    return Promise.race([restore, timeout]).then((read) => {
      late = true;
      this.read = read;
      void this.backup(); // seed the mirror (no write when nothing changed)
    });
  }

  // Writes chain, so two quick backups never race each other, and an
  // unchanged set costs no store call. Never rejects.
  backup(): Promise<void> {
    if (!this.read) return this.chain;
    this.chain = this.chain
      .then(async () => {
        this.last = await backupTo(this.ls(), this.store, this.last);
      })
      .catch(() => {
        // the next backup tries again with the full set
      });
    return this.chain;
  }
}

// ---------------------------------------------------------------------------
// The app's mirror: Preferences on native, none on the web.
// ---------------------------------------------------------------------------

const mirror = Capacitor.isNativePlatform()
  ? new SaveMirror(() => localStorage, {
      get: async (key) => (await Preferences.get({ key })).value,
      set: (key, value) => Preferences.set({ key, value }),
    })
  : null;

// Await this before anything reads localStorage. Null on the web, so the
// web boot does not wait at all.
export function restoreSaves(): Promise<void> | null {
  return mirror ? mirror.restore() : null;
}

// Fire and forget; a no-op on the web.
export function backupSaves(): void {
  void mirror?.backup();
}
