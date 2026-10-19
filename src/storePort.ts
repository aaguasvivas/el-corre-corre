// storePort.ts: the StorePort over @capgo/native-purchases (StoreKit 2).
// Native only; main.ts never builds it on the web.
//
// DECISION: @capgo/native-purchases 8.x over cordova-plugin-purchase 13.x.
// It is a Capacitor 8 plugin written on StoreKit 2 itself (Product.purchase,
// Transaction.updates from the moment it loads, currentEntitlements,
// AppStore.sync), released every few days in 2026, with non-consumables,
// restore and transaction updates in its own API, and no server or account.
// cordova-plugin-purchase's iOS core is StoreKit 1 (SKPaymentQueue); its
// StoreKit 2 path is a separate add-on plugin and a receipt-validation
// framework this one-product game does not need.

import { NativePurchases, PURCHASE_TYPE, type Transaction } from '@capgo/native-purchases';
import type { StorePort } from './purchases';

export function nativeStorePort(): StorePort {
  return {
    price: async (id) => {
      try {
        const { product } = await NativePurchases.getProduct({ productIdentifier: id, productType: PURCHASE_TYPE.INAPP });
        return product.priceString || null;
      } catch (e) {
        // "Product not found": App Store Connect has no such product (yet).
        if (/not found/i.test(String((e as { message?: unknown })?.message ?? ''))) return null;
        throw e;
      }
    },
    buy: async (id) => {
      await NativePurchases.purchaseProduct({ productIdentifier: id, productType: PURCHASE_TYPE.INAPP, quantity: 1 });
    },
    restore: () => NativePurchases.restorePurchases(),
    // currentEntitlements: this Apple ID only, refunds already gone.
    owned: async () => {
      const { purchases } = await NativePurchases.getPurchases({ productType: PURCHASE_TYPE.INAPP, onlyCurrentEntitlements: true });
      return purchases.filter((p) => !p.revocationDate).map((p) => p.productIdentifier);
    },
    onUpdate: (cb) => {
      void NativePurchases.addListener('transactionUpdated', (t: Transaction) => cb(t.productIdentifier, !!t.revocationDate));
    },
  };
}
