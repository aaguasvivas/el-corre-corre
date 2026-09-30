// announce.ts: the announcement lane's queue. One slot for the big words
// (records, places, mandaos, set pieces, the multiplier), so two of them
// never overlap. Pure logic on its own clock: the UI feeds it real seconds
// and renders whatever is current. Priorities and times live in
// CONFIG.announce.

import { CONFIG } from './config';

export type AnnounceKind = keyof typeof CONFIG.announce;

// The look of the plate: a record burst, a green road sign, a gold mandao
// plate, a red street warning, a flag-blue multiplier, a cream card.
export type AnnounceStyle = 'record' | 'sign' | 'gold' | 'red' | 'blue' | 'cream';

export interface Announcement {
  kind: AnnounceKind;
  style: AnnounceStyle;
  kicker: string; // the small line above; '' for none
  text: string; // the big line
  priority: number;
  minSec: number;
  showSec: number;
  ttlSec: number;
  at: number; // queue clock when it was pushed
}

// Each kind's plate.
const STYLE: Record<AnnounceKind, AnnounceStyle> = {
  record: 'record',
  shield: 'gold',
  tramo: 'sign',
  mult: 'blue',
  levelUp: 'gold',
  mandao: 'gold',
  setPiece: 'red',
  streetWild: 'red',
  nudge: 'cream',
  landmark: 'cream',
};

export function announcement(kind: AnnounceKind, text: string, kicker = ''): Omit<Announcement, 'at'> {
  const [priority, minSec, showSec, ttlSec] = CONFIG.announce[kind];
  return { kind, style: STYLE[kind], kicker, text, priority, minSec, showSec, ttlSec };
}

export class AnnounceQueue {
  now = 0;
  current: Announcement | null = null;
  lastCut = false; // the last one to leave was cut short by a bigger one
  private shownAt = 0;
  freeAt = 0; // the lane stays empty until then (the exit of the last one)
  private readonly pending: Announcement[] = [];

  get queued(): number {
    return this.pending.length;
  }

  // Seconds the current announcement has been up.
  get age(): number {
    return this.current ? this.now - this.shownAt : 0;
  }

  push(a: Omit<Announcement, 'at'>): void {
    const item: Announcement = { ...a, at: this.now };
    // Highest priority first; equal priorities keep their order.
    let i = this.pending.length;
    while (i > 0 && this.pending[i - 1].priority < item.priority) i--;
    this.pending.splice(i, 0, item);
  }

  // Advance the clock. Returns true when the lane changed: a new current
  // announcement, or the current one ended.
  step(dt: number): boolean {
    this.now += dt;
    let changed = false;
    const cur = this.current;
    if (cur) {
      const age = this.now - this.shownAt;
      const top = this.pending[0];
      const cut = top !== undefined && top.priority > cur.priority && age >= cur.minSec;
      if (age >= cur.showSec || cut) {
        this.current = null;
        this.lastCut = age < cur.showSec;
        this.freeAt = this.now + CONFIG.announceOutSec;
        changed = true;
      }
    }
    if (!this.current && this.now >= this.freeAt) {
      while (this.pending.length > 0) {
        const next = this.pending.shift()!;
        if (this.now - next.at > next.ttlSec) continue; // stale: its moment passed
        this.current = next;
        this.shownAt = this.now;
        changed = true;
        break;
      }
    }
    return changed;
  }

  clear(): void {
    this.pending.length = 0;
    this.current = null;
    this.freeAt = 0;
  }
}
