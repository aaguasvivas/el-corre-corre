// share.ts against mocked Capacitor plugins (the native path) and a stubbed
// navigator and document (the web path): which transport runs, what it is
// handed, and how a dismissed sheet differs from a failure.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  native: false,
  files: new Map<string, string>(),
  // each call to the sheet, with what the cache held at that moment
  shared: [] as Array<{ opts: { title?: string; text?: string; files?: string[] }; cache: Map<string, string> }>,
  shareError: null as Error | null,
  writeError: null as Error | null,
}));

vi.mock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => m.native } }));
vi.mock('@capacitor/filesystem', () => ({
  Directory: { Cache: 'CACHE' },
  Filesystem: {
    writeFile: async (o: { path: string; data: string; directory: string }) => {
      if (m.writeError) throw m.writeError;
      m.files.set(`${o.directory}/${o.path}`, o.data);
      return { uri: `file:///cache/${o.path}` };
    },
    deleteFile: async (o: { path: string; directory: string }) => {
      m.files.delete(`${o.directory}/${o.path}`);
    },
  },
}));
vi.mock('@capacitor/share', () => ({
  Share: {
    share: async (o: { title?: string; text?: string; files?: string[] }) => {
      if (m.shareError) throw m.shareError;
      m.shared.push({ opts: o, cache: new Map(m.files) });
      return { activityType: 'com.apple.UIKit.activity.Message' };
    },
  },
}));

import { shareImage } from '../share';

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 1, 2, 250, 251, 252]);
const card = (): Blob => new Blob([PNG], { type: 'image/png' });
const NAME = 'el-corre-corre-12840pts-20260930-031500.png';
const TEXT = '¡Hice 12,840 puntos en El Corre Corre! ¿Me puedes ganar?';
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  m.files.clear();
  m.shared.length = 0;
  m.shareError = null;
  m.writeError = null;
});

describe('share: inside the app', () => {
  beforeEach(() => {
    m.native = true;
  });

  it('writes the PNG to the cache, opens the native sheet with it, then clears it', async () => {
    expect(await shareImage(card(), NAME, TEXT)).toBe('shared');
    expect(m.shared.length).toBe(1);
    expect(m.shared[0].opts).toEqual({ title: 'El Corre Corre', text: TEXT, files: [`file:///cache/${NAME}`] });
    // the exact bytes were on disk when the sheet opened
    expect(Buffer.from(m.shared[0].cache.get(`CACHE/${NAME}`) ?? '', 'base64')).toEqual(Buffer.from(PNG));
    await flush();
    expect(m.files.size).toBe(0);
  });

  it('a dismissed sheet is a choice, not an error', async () => {
    m.shareError = new Error('Share canceled');
    expect(await shareImage(card(), NAME, TEXT)).toBe('cancelled');
    await flush();
    expect(m.files.size).toBe(0);
  });

  it('a failure says so, and never touches a sheet that is still open', async () => {
    m.shareError = new Error("Can't share while sharing is in progress");
    expect(await shareImage(card(), NAME, TEXT)).toBe('failed');
    await flush();
    expect(m.files.has(`CACHE/${NAME}`)).toBe(true); // the open sheet still needs it
    m.shareError = null;
    m.writeError = new Error('disk full');
    expect(await shareImage(card(), 'other.png', TEXT)).toBe('failed');
  });

  it('never falls back to a web download inside the app', async () => {
    const create = vi.fn();
    vi.stubGlobal('document', { createElement: create });
    m.shareError = new Error('Error sharing item');
    expect(await shareImage(card(), NAME, TEXT)).toBe('failed');
    expect(create).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});

describe('share: on the web', () => {
  let clicks: Array<{ href: string; download: string }>;

  beforeEach(() => {
    m.native = false;
    clicks = [];
    // node 18 has no global File: a named Blob is all share.ts needs
    if (typeof File === 'undefined') {
      vi.stubGlobal(
        'File',
        class extends Blob {
          constructor(
            parts: BlobPart[],
            readonly name: string,
            opts?: BlobPropertyBag,
          ) {
            super(parts, opts);
          }
        },
      );
    }
    vi.stubGlobal('document', {
      createElement: () => {
        const a = { href: '', download: '', click: () => clicks.push({ href: a.href, download: a.download }) };
        return a;
      },
    });
    vi.stubGlobal('URL', { createObjectURL: () => 'blob:card', revokeObjectURL: () => {} });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const nav = (canShare: boolean, share: (d: ShareData) => Promise<void>): void => {
    vi.stubGlobal('navigator', { canShare: () => canShare, share });
  };

  it('shares the file through Web Share when the browser can take one', async () => {
    let got: ShareData | null = null;
    nav(true, async (d) => {
      got = d;
    });
    expect(await shareImage(card(), NAME, TEXT)).toBe('shared');
    const files = (got as ShareData | null)?.files ?? [];
    expect(files[0].name).toBe(NAME);
    expect(files[0].type).toBe('image/png');
    expect((got as ShareData | null)?.text).toBe(TEXT);
    expect(clicks).toEqual([]);
  });

  it('respects a dismissed sheet: no download behind it', async () => {
    nav(true, async () => {
      throw Object.assign(new Error('dismissed'), { name: 'AbortError' });
    });
    expect(await shareImage(card(), NAME, TEXT)).toBe('cancelled');
    expect(clicks).toEqual([]);
  });

  it('a refused share or no file sharing at all downloads the card', async () => {
    nav(true, async () => {
      throw Object.assign(new Error('no activation'), { name: 'NotAllowedError' });
    });
    expect(await shareImage(card(), NAME, TEXT)).toBe('saved');
    nav(false, async () => {});
    expect(await shareImage(card(), NAME, TEXT)).toBe('saved');
    expect(clicks).toEqual([
      { href: 'blob:card', download: NAME },
      { href: 'blob:card', download: NAME },
    ]);
  });
});
