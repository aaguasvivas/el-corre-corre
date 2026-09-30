// The native save mirror (storage.ts) against a fake localStorage and a fake
// Capacitor Preferences: what comes back after the OS wipes the web view,
// what never gets overwritten, and a bridge that fails or never answers.
import { describe, expect, it } from 'vitest';
import {
  BACKUP_KEY,
  SaveMirror,
  backupTo,
  restoreFrom,
  snapshotSaves,
  type BackupStore,
  type SaveStorage,
} from '../storage';

class FakeStorage implements SaveStorage {
  readonly map = new Map<string, string>();
  get length(): number {
    return this.map.size;
  }
  key(i: number): string | null {
    return [...this.map.keys()][i] ?? null;
  }
  getItem(k: string): string | null {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, String(v));
  }
}

class FakePreferences implements BackupStore {
  readonly map = new Map<string, string>();
  gets = 0;
  sets = 0;
  failSet = false;
  hang = false; // get never answers until release()
  private release: (() => void) | null = null;
  async get(k: string): Promise<string | null> {
    this.gets++;
    if (this.hang) await new Promise<void>((r) => (this.release = r));
    return this.map.get(k) ?? null;
  }
  async set(k: string, v: string): Promise<void> {
    if (this.failSet) throw new Error('bridge down');
    this.sets++;
    this.map.set(k, v);
  }
  answer(): void {
    this.release?.();
  }
}

// A career in progress: records, the wallet, a pintura, a mandao set, EN.
function played(): FakeStorage {
  const ls = new FakeStorage();
  ls.setItem('ecc.v1.record.motor', '12840');
  ls.setItem('ecc.v1.recordDist.motor', '2310');
  ls.setItem('ecc.v1.platanosLifetime', '1375');
  ls.setItem('ecc.v1.pinturas.motor', '1,2');
  ls.setItem('ecc.v1.pintura.motor', '2');
  ls.setItem('ecc.v1.mandaos', JSON.stringify({ level: 4, ids: ['a', 'b', 'c'], progress: [3, 0, 1] }));
  ls.setItem('ecc.v1.lang', 'en');
  ls.setItem('CapacitorStorage.other', 'not ours');
  ls.setItem('some.other.site', 'x');
  return ls;
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('the save mirror', () => {
  it('mirrors every ecc.v1 key and nothing else', async () => {
    const ls = played();
    const prefs = new FakePreferences();
    await backupTo(ls, prefs, null);
    const saves = JSON.parse(prefs.map.get(BACKUP_KEY)!).saves as Record<string, string>;
    expect(Object.keys(saves).sort()).toEqual(Object.keys(snapshotSaves(ls)).sort());
    expect(Object.keys(saves).every((k) => k.startsWith('ecc.v1.'))).toBe(true);
    expect(saves['ecc.v1.platanosLifetime']).toBe('1375');
  });

  it('brings a wiped web view back exactly as it was', async () => {
    const ls = played();
    const prefs = new FakePreferences();
    await backupTo(ls, prefs, null);
    const before = snapshotSaves(ls);
    const wiped = new FakeStorage(); // the OS reclaimed the web view's storage
    expect(await restoreFrom(wiped, prefs)).toBe(Object.keys(before).length);
    expect(snapshotSaves(wiped)).toEqual(before);
  });

  it('never overwrites saves that are already there', async () => {
    const prefs = new FakePreferences();
    await backupTo(played(), prefs, null);
    const ls = new FakeStorage();
    ls.setItem('ecc.v1.record.motor', '99999'); // newer play than the mirror
    expect(await restoreFrom(ls, prefs)).toBe(0);
    expect(prefs.gets).toBe(0);
    expect(ls.getItem('ecc.v1.record.motor')).toBe('99999');
    expect(ls.getItem('ecc.v1.platanosLifetime')).toBeNull();
  });

  it('shrugs off a corrupt or foreign mirror', async () => {
    const prefs = new FakePreferences();
    for (const raw of ['{not json', 'null', '{"v":1}', '{"v":1,"saves":"x"}']) {
      prefs.map.set(BACKUP_KEY, raw);
      const ls = new FakeStorage();
      expect(await restoreFrom(ls, prefs), raw).toBe(0);
      expect(ls.length).toBe(0);
    }
    prefs.map.set(BACKUP_KEY, JSON.stringify({ v: 1, saves: { 'ecc.v1.lang': 'en', 'evil.key': '1', 'ecc.v1.n': 5 } }));
    const ls = new FakeStorage();
    expect(await restoreFrom(ls, prefs)).toBe(1);
    expect(snapshotSaves(ls)).toEqual({ 'ecc.v1.lang': 'en' });
  });

  it('writes only when something changed, and never an empty set', async () => {
    const prefs = new FakePreferences();
    const ls = new FakeStorage();
    let last = await backupTo(ls, prefs, null);
    expect(prefs.sets).toBe(0); // a brand-new player: nothing to lose, nothing written
    ls.setItem('ecc.v1.muted', '1');
    last = await backupTo(ls, prefs, last);
    last = await backupTo(ls, prefs, last);
    expect(prefs.sets).toBe(1);
    ls.setItem('ecc.v1.muted', '0');
    await backupTo(ls, prefs, last);
    expect(prefs.sets).toBe(2);
    expect(JSON.parse(prefs.map.get(BACKUP_KEY)!).saves).toEqual({ 'ecc.v1.muted': '0' });
  });

  it('a boot with saves seeds the mirror; a wiped boot restores it', async () => {
    const prefs = new FakePreferences();
    const ls = played();
    const first = new SaveMirror(() => ls, prefs, 50);
    await first.restore();
    await first.backup();
    expect(prefs.sets).toBe(1); // the first launch after the update is covered

    ls.setItem('ecc.v1.record.motor', '15000'); // a run ends
    await first.backup();
    expect(prefs.sets).toBe(2);

    const wiped = new FakeStorage();
    const next = new SaveMirror(() => wiped, prefs, 50);
    await next.restore();
    expect(wiped.getItem('ecc.v1.record.motor')).toBe('15000');
    expect(snapshotSaves(wiped)).toEqual(snapshotSaves(ls));
  });

  it('a bridge that never answers: the boot goes on, and the mirror stays safe', async () => {
    const prefs = new FakePreferences();
    await backupTo(played(), prefs, null);
    const good = prefs.map.get(BACKUP_KEY);
    prefs.hang = true;
    const ls = new FakeStorage();
    const m = new SaveMirror(() => ls, prefs, 30);
    const t0 = Date.now();
    await m.restore();
    expect(Date.now() - t0).toBeLessThan(1000);
    expect(ls.length).toBe(0); // booted fresh

    ls.setItem('ecc.v1.record.motor', '40'); // a fresh run under the timed-out boot
    await m.backup();
    prefs.answer(); // the late answer lands after the game started
    await wait(10);
    expect(ls.getItem('ecc.v1.platanosLifetime')).toBeNull(); // not mixed into the running game
    expect(prefs.map.get(BACKUP_KEY)).toBe(good); // and the good mirror was not buried
  });

  it('a failing write never throws, and the next backup retries', async () => {
    const prefs = new FakePreferences();
    const ls = played();
    const m = new SaveMirror(() => ls, prefs, 50);
    prefs.failSet = true;
    await m.restore();
    await m.backup();
    expect(prefs.map.has(BACKUP_KEY)).toBe(false);
    prefs.failSet = false;
    await m.backup();
    expect(prefs.map.has(BACKUP_KEY)).toBe(true);
  });

  it('a localStorage that throws cannot stop the boot', async () => {
    const prefs = new FakePreferences();
    const m = new SaveMirror(() => {
      throw new Error('SecurityError');
    }, prefs, 50);
    await expect(m.restore()).resolves.toBeUndefined();
    await expect(m.backup()).resolves.toBeUndefined();
  });
});
