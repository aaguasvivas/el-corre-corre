// purchases.ts: Remove Ads, the one in-app purchase ($1.99, non-consumable).
// Owning it removes every banner; the opt-in "Duplica tus plátanos" video
// stays, since it only ever plays when the player taps it. No server and no
// account: ownership is StoreKit's own record, re-read at launch, on every
// transaction update and on restore, and cached in localStorage as
// ecc.v1.adFree (so the Preferences mirror in storage.ts backs it up and a
// launch with no network still knows).
//
// Plain logic over a StorePort (src/storePort.ts on iOS, src/simAds.ts in a
// dev page opened with ?ads=sim, a fake in the tests).
//
// How each outcome reaches us, traced through @capgo/native-purchases'
// Swift source (StoreKit 2), not its docs:
//   success      purchase() resolves with the verified transaction
//   cancel       purchase() rejects "User cancelled" (.userCancelled)
//   pending      purchase() rejects "Transaction pending" (Ask to Buy, SCA);
//                the later approval arrives as a transactionUpdated event
//   failure      purchase() rejects with StoreKit's message (unverified,
//                not allowed, network), or "Cannot find product for id"
//   owned        StoreKit 2 re-grants an owned non-consumable as a success;
//                we check currentEntitlements first and say so instead
//   restore      AppStore.sync() resolves with no data; ownership is read
//                back from currentEntitlements (refunds drop out of it)
//   refund       Transaction.updates delivers a transaction carrying a
//                revocation date: re-read currentEntitlements

import { CONFIG } from './config';
import { withTimeout } from './bounded';

export const AD_FREE_KEY = 'ecc.v1.adFree';

export interface StorePort {
  price(productId: string): Promise<string | null>; // the localized price, or null when the store has no such product
  buy(productId: string): Promise<void>; // resolves on a verified purchase; rejects with the store's message
  restore(): Promise<void>;
  owned(): Promise<string[]>; // product ids the signed-in Apple ID owns now
  onUpdate(cb: (productId: string, revoked: boolean) => void): void;
}

export type BuyOutcome = 'success' | 'owned' | 'cancelled' | 'pending' | 'failed' | 'unavailable';
export type RestoreOutcome = 'restored' | 'nothing' | 'failed';

// A purchase that did not happen, by the store's own words.
export function classifyStoreError(e: unknown): 'cancelled' | 'pending' | 'failed' | 'unavailable' {
  const msg = String((e as { message?: unknown } | null)?.message ?? e ?? '');
  if (/cancel/i.test(msg)) return 'cancelled';
  if (/pending|deferred/i.test(msg)) return 'pending';
  if (/cannot find product|product not found/i.test(msg)) return 'unavailable';
  return 'failed';
}

type SaveStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function readAdFree(ls: () => SaveStorage): boolean {
  try {
    return ls().getItem(AD_FREE_KEY) === '1';
  } catch {
    return false;
  }
}

export class Entitlements {
  adFree: boolean;
  price: string | null = null; // the localized price, once the store has answered
  priceState: 'unknown' | 'loading' | 'ready' | 'unavailable' = 'unknown';
  // Ownership flipped (bought, restored, approved later, refunded).
  onChange: () => void = () => {};

  constructor(
    private readonly port: StorePort | null,
    readonly productId: string,
    private readonly ls: () => SaveStorage = () => localStorage,
  ) {
    this.adFree = readAdFree(ls);
  }

  // A store to buy from (iOS, or the dev simulation).
  get available(): boolean {
    return this.port !== null;
  }

  // At launch: listen for transactions, then re-read what is owned. The
  // listener goes first so an approval that lands during the read is not
  // missed; the read covers any update delivered before JavaScript was
  // listening (the plugin drops events nobody hears).
  async init(): Promise<void> {
    const port = this.port;
    if (!port) return;
    port.onUpdate((id, revoked) => {
      if (id !== this.productId) return;
      if (revoked) void this.refresh();
      else this.setAdFree(true); // an Ask to Buy approval, or a purchase on another device
    });
    await this.refresh();
  }

  // Ownership from StoreKit. A read that fails or times out changes nothing:
  // the cached answer stands until the store can be asked.
  async refresh(): Promise<void> {
    if (!this.port) return;
    try {
      const owned = await withTimeout(this.port.owned(), CONFIG.storeTimeoutMs);
      this.setAdFree(owned.includes(this.productId));
    } catch {
      // offline or StoreKit busy: keep what we knew
    }
  }

  async loadPrice(): Promise<void> {
    if (!this.port || this.priceState === 'loading' || this.priceState === 'ready') return;
    this.priceState = 'loading';
    try {
      const p = await withTimeout(this.port.price(this.productId), CONFIG.storeTimeoutMs);
      this.price = p;
      this.priceState = p ? 'ready' : 'unavailable';
    } catch {
      this.priceState = 'unknown'; // try again next time the sheet opens
    }
  }

  async buy(): Promise<BuyOutcome> {
    const port = this.port;
    if (!port) return 'unavailable';
    if (this.adFree) return 'owned';
    // Owned already (another device, or a cache the OS wiped): say so
    // instead of walking the player through StoreKit's re-download sheet.
    try {
      const owned = await withTimeout(port.owned(), CONFIG.storeTimeoutMs);
      if (owned.includes(this.productId)) {
        this.setAdFree(true);
        return 'owned';
      }
    } catch {
      // could not check; the purchase itself decides
    }
    try {
      await port.buy(this.productId); // the player's own sheet: no deadline
      this.setAdFree(true);
      return 'success';
    } catch (e) {
      return classifyStoreError(e);
    }
  }

  async restore(): Promise<RestoreOutcome> {
    const port = this.port;
    if (!port) return 'failed';
    try {
      await port.restore(); // may ask the player to sign in: no deadline
      const owned = await withTimeout(port.owned(), CONFIG.storeTimeoutMs);
      const has = owned.includes(this.productId);
      this.setAdFree(has);
      return has ? 'restored' : 'nothing';
    } catch {
      return 'failed';
    }
  }

  private setAdFree(on: boolean): void {
    if (on === this.adFree) return;
    this.adFree = on;
    try {
      if (on) this.ls().setItem(AD_FREE_KEY, '1');
      else this.ls().removeItem(AD_FREE_KEY);
    } catch {
      // the store re-reads it at the next launch
    }
    this.onChange();
  }
}
