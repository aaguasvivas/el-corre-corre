// share.ts: how the share card leaves the game. Inside the iOS wrap the PNG
// is written to the app's cache and handed to the native share sheet
// (@capacitor/share), because WKWebView has no download path: a blob: link
// is cancelled and passed to UIApplication.open, which cannot open it, so
// the web fallback would make COMPARTIR a dead button. On the web it is the
// Web Share API with the file when the browser can take one, else a plain
// download.

import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

// shared: a share sheet took it. saved: it went down as a download (web).
// cancelled: the player closed the sheet, a real choice, so no error UI.
// failed: nothing could take it.
export type ShareResult = 'shared' | 'saved' | 'cancelled' | 'failed';

const TITLE = 'El Corre Corre';

export function shareImage(blob: Blob, fileName: string, text: string): Promise<ShareResult> {
  return Capacitor.isNativePlatform() ? shareNative(blob, fileName, text) : shareWeb(blob, fileName, text);
}

// The Filesystem plugin takes the file as base64. Chunked, so a big card
// never overflows the argument list.
async function base64Of(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// The iOS plugin rejects a dismissed sheet with "Share canceled".
function isCancel(e: unknown): boolean {
  const msg = (e as { message?: unknown } | null)?.message;
  return typeof msg === 'string' && /cancel/i.test(msg);
}

async function shareNative(blob: Blob, fileName: string, text: string): Promise<ShareResult> {
  let result: ShareResult;
  try {
    const { uri } = await Filesystem.writeFile({
      path: fileName,
      data: await base64Of(blob),
      directory: Directory.Cache,
    });
    await Share.share({ title: TITLE, text, files: [uri] });
    result = 'shared';
  } catch (e) {
    result = isCancel(e) ? 'cancelled' : 'failed';
  }
  // Once our sheet is done with the file (the target app has its copy), the
  // cache keeps no pile of old cards. Not after a failure: a second tap
  // while the sheet is still up fails, and the open sheet still needs it.
  if (result !== 'failed') void Filesystem.deleteFile({ path: fileName, directory: Directory.Cache }).catch(() => {});
  return result;
}

async function shareWeb(blob: Blob, fileName: string, text: string): Promise<ShareResult> {
  const file = new File([blob], fileName, { type: 'image/png' });
  let canFiles = false;
  try {
    canFiles = navigator.canShare?.({ files: [file] }) ?? false;
  } catch {
    canFiles = false; // a throwing canShare just means no file sharing here
  }
  if (canFiles) {
    try {
      await navigator.share({ files: [file], title: TITLE, text });
      return 'shared';
    } catch (e) {
      // Dismissing the sheet is a real choice, so respect it. Anything else
      // (the browser refusing the call, no activation left) falls through to
      // the download, because COMPARTIR must never be a dead button.
      if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return 'saved';
  } catch {
    return 'failed';
  }
}
