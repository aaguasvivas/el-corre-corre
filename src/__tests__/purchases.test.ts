// purchases.ts against a fake StoreKit: every outcome of a Remove Ads buy
// (the plugin's own rejection strings), restore, transaction updates,
// refunds, and the cached ecc.v1.adFree entitlement.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AD_FREE_KEY, Entitlements, classifyStoreError, type StorePort } from '../purchases';
import { CONFIG } from '../config';

const ID = 'elcorrecorre.remove_ads';

class FakeStore implements StorePort {
  owns: string[] = [];
  ownedRead: 'ok' | 'reject' | 'hang' = 'ok';
  buyWith: 'success' | string = 'success'; // or the rejection message
  restoreWith: 'ok' | 'reject' = 'ok';
  priceWith: string | null | 'reject' = 'US$1.99';
  bought = 0;
  update: (id: string, revoked: boolean) => void = () => {};
  price = async (): Promise<string | null> => {
    if (this.priceWith === 'reject') throw new Error('offline');
    return this.priceWith;
  };
  buy = async (id: string): Promise<void> => {
    this.bought++;
    if (this.buyWith !== 'success') throw new Error(this.buyWith);
    this.owns.push(id);
  };
  restore = async (): Promise<void> => {
    if (this.restoreWith === 'reject') throw new Error('Cannot connect to iTunes Store');
  };
  owned = (): Promise<string[]> => {
    if (this.ownedRead === 'reject') return Promise.reject(new Error('busy'));
    if (this.ownedRead === 'hang') return new Promise(() => {});
    return Promise.resolve([...this.owns]);
  };
  onUpdate = (cb: (id: string, revoked: boolean) => void): void => {
    this.update = cb;
  };
}

function storage(init: Record<string, string> = {}): Map<string, string> & Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  const m = new Map(Object.entries(init)) as Map<string, string> & Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  m.getItem = (k) => m.get(k) ?? null;
  m.setItem = (k, v) => void m.set(k, v);
  m.removeItem = (k) => void m.delete(k);
  return m;
}

function make(init: Record<string, string> = {}): { e: Entitlements; store: FakeStore; ls: ReturnType<typeof storage>; changes: boolean[] } {
  const store = new FakeStore();
  const ls = storage(init);
  const e = new Entitlements(store, ID, () => ls);
  const changes: boolean[] = [];
  e.onChange = () => changes.push(e.adFree);
  return { e, store, ls, changes };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('classifyStoreError: the plugin’s own words', () => {
  it('maps @capgo/native-purchases rejections to outcomes', () => {
    expect(classifyStoreError(new Error('User cancelled'))).toBe('cancelled');
    expect(classifyStoreError(new Error('Transaction pending'))).toBe('pending');
    expect(classifyStoreError(new Error(`Cannot find product for id ${ID}`))).toBe('unavailable');
    expect(classifyStoreError(new Error('The operation couldn’t be completed. (StoreKit.StoreKitError error 2.)'))).toBe('failed');
    expect(classifyStoreError(undefined)).toBe('failed');
  });
});

describe('Entitlements: Remove Ads', () => {
  it('reads the cached entitlement at once, then StoreKit confirms it at launch', async () => {
    const { e, store, ls } = make({ [AD_FREE_KEY]: '1' });
    expect(e.adFree).toBe(true);
    store.owns = [ID];
    await e.init();
    expect(e.adFree).toBe(true);
    expect(ls.get(AD_FREE_KEY)).toBe('1');
  });

  it('a launch that finds the product owned (a wiped cache, another device) turns ads off', async () => {
    const { e, store, ls, changes } = make();
    store.owns = [ID];
    await e.init();
    expect(e.adFree).toBe(true);
    expect(ls.get(AD_FREE_KEY)).toBe('1');
    expect(changes).toEqual([true]);
  });

  it('a refund (no longer a current entitlement) turns ads back on', async () => {
    const { e, ls } = make({ [AD_FREE_KEY]: '1' });
    await e.init();
    expect(e.adFree).toBe(false);
    expect(ls.has(AD_FREE_KEY)).toBe(false);
  });

  it('a StoreKit read that fails or hangs keeps the cached answer', async () => {
    const a = make({ [AD_FREE_KEY]: '1' });
    a.store.ownedRead = 'reject';
    await a.e.init();
    expect(a.e.adFree).toBe(true);
    const b = make({ [AD_FREE_KEY]: '1' });
    b.store.ownedRead = 'hang';
    const p = b.e.init();
    await vi.advanceTimersByTimeAsync(CONFIG.storeTimeoutMs + 10);
    await p;
    expect(b.e.adFree).toBe(true);
  });

  it('buy: success turns ads off and caches it', async () => {
    const { e, store, ls, changes } = make();
    expect(await e.buy()).toBe('success');
    expect(store.bought).toBe(1);
    expect(e.adFree).toBe(true);
    expect(ls.get(AD_FREE_KEY)).toBe('1');
    expect(changes).toEqual([true]);
  });

  it('buy: already owned says so without a StoreKit sheet', async () => {
    const { e, store } = make();
    store.owns = [ID];
    expect(await e.buy()).toBe('owned');
    expect(store.bought).toBe(0);
    expect(e.adFree).toBe(true);
    expect(await e.buy()).toBe('owned');
  });

  it('buy: cancel, pending, failure and a missing product change nothing', async () => {
    for (const [msg, want] of [
      ['User cancelled', 'cancelled'],
      ['Transaction pending', 'pending'],
      ['Purchase not allowed', 'failed'],
      [`Cannot find product for id ${ID}`, 'unavailable'],
    ] as const) {
      const { e, store, ls } = make();
      store.buyWith = msg;
      expect(await e.buy()).toBe(want);
      expect(e.adFree).toBe(false);
      expect(ls.has(AD_FREE_KEY)).toBe(false);
    }
  });

  it('buy: a check that cannot read ownership still lets the purchase decide', async () => {
    const { e, store } = make();
    store.ownedRead = 'reject';
    expect(await e.buy()).toBe('success');
    expect(store.bought).toBe(1);
  });

  it('pending, then Ask to Buy approves: the transaction update turns ads off', async () => {
    const { e, store, changes } = make();
    await e.init();
    store.buyWith = 'Transaction pending';
    expect(await e.buy()).toBe('pending');
    store.owns = [ID];
    store.update(ID, false);
    expect(e.adFree).toBe(true);
    expect(changes).toEqual([true]);
  });

  it('an update for another product is ignored; a revoked one re-reads ownership', async () => {
    const { e, store } = make();
    store.owns = [ID];
    await e.init();
    store.update('some.other', false);
    store.update('some.other', true);
    expect(e.adFree).toBe(true);
    store.owns = [];
    store.update(ID, true);
    await vi.advanceTimersByTimeAsync(0);
    expect(e.adFree).toBe(false);
  });

  it('restore: owned, nothing to restore, or a failure', async () => {
    const a = make();
    a.store.owns = [ID];
    expect(await a.e.restore()).toBe('restored');
    expect(a.e.adFree).toBe(true);
    const b = make();
    expect(await b.e.restore()).toBe('nothing');
    expect(b.e.adFree).toBe(false);
    const c = make();
    c.store.restoreWith = 'reject';
    expect(await c.e.restore()).toBe('failed');
  });

  it('the localized price, a store without the product, and an offline read', async () => {
    const a = make();
    await a.e.loadPrice();
    expect(a.e.priceState).toBe('ready');
    expect(a.e.price).toBe('US$1.99');
    const b = make();
    b.store.priceWith = null;
    await b.e.loadPrice();
    expect(b.e.priceState).toBe('unavailable');
    const c = make();
    c.store.priceWith = 'reject';
    await c.e.loadPrice();
    expect(c.e.priceState).toBe('unknown'); // asked again next time
  });

  it('no store (the web build): nothing to buy', async () => {
    const e = new Entitlements(null, ID, () => storage());
    expect(e.available).toBe(false);
    await e.init();
    expect(await e.buy()).toBe('unavailable');
    expect(await e.restore()).toBe('failed');
  });
});
