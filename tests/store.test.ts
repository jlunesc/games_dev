import { describe, expect, it } from 'vitest';
import { NORMAL_DIALS } from '../src/game/difficulty';
import { analyzeFight } from '../src/stats/analyze';
import { buildRecord, recordUpdate, startRecording } from '../src/stats/record';
import { MemoryFightStore, openIndexedDbStore, type StoredFight } from '../src/stats/store';
import { withInput } from './helpers';

/** A small finished fight, with a real analysis. `playedAt` and `seed` make its id unique. */
function sampleFight(playedAt: string, seed = 1): StoredFight {
  let rec = startRecording({
    bossId: 'ember-duelist',
    presetId: 'normal',
    dials: { ...NORMAL_DIALS },
    seed,
    playedAt,
  });
  for (let n = 0; n < 5; n++) rec = recordUpdate(rec, withInput({ moveX: 1 }));
  const analysis = analyzeFight({
    bossId: rec.meta.bossId,
    dials: rec.meta.dials,
    seed: rec.meta.seed,
    input: rec.runs,
  });
  return buildRecord(rec, 'victory', 1, analysis);
}

describe('MemoryFightStore', () => {
  it('round-trips fights, oldest first, and counts them', async () => {
    const store = new MemoryFightStore();
    const later = sampleFight('2026-09-20T11:00:00.000Z');
    const earlier = sampleFight('2026-09-20T10:00:00.000Z');
    await store.add(later);
    await store.add(earlier);
    expect(await store.count()).toBe(2);
    expect(await store.all()).toEqual([earlier, later]);
  });

  it('orders fights with the same time by id', async () => {
    const store = new MemoryFightStore();
    const b = sampleFight('2026-09-20T10:00:00.000Z', 0xb);
    const a = sampleFight('2026-09-20T10:00:00.000Z', 0xa);
    await store.add(b);
    await store.add(a);
    expect((await store.all()).map((f) => f.id)).toEqual([a.id, b.id]);
  });

  it('replaces a fight that is added again with the same id', async () => {
    const store = new MemoryFightStore();
    const first = sampleFight('2026-09-20T10:00:00.000Z');
    await store.add(first);
    await store.add({ ...first, result: 'defeat' });
    expect(await store.count()).toBe(1);
    expect((await store.all())[0]?.result).toBe('defeat');
  });

  it('clears everything', async () => {
    const store = new MemoryFightStore();
    await store.add(sampleFight('2026-09-20T10:00:00.000Z'));
    await store.clear();
    expect(await store.count()).toBe(0);
    expect(await store.all()).toEqual([]);
  });

  it('hands out copies, so changing them does not change the store', async () => {
    const store = new MemoryFightStore();
    const fight = sampleFight('2026-09-20T10:00:00.000Z');
    await store.add(fight);
    const got = await store.all();
    got[0]!.result = 'defeat';
    got.pop();
    fight.attempt = 99;
    const again = await store.all();
    expect(again).toHaveLength(1);
    expect(again[0]?.result).toBe('victory');
    expect(again[0]?.attempt).toBe(1);
  });
});

describe('openIndexedDbStore', () => {
  it('resolves to null when there is no IndexedDB (the Node test environment)', async () => {
    expect(await openIndexedDbStore()).toBeNull();
  });

  it('resolves to null when opening fails', async () => {
    const broken = {
      open() {
        throw new Error('blocked');
      },
    } as unknown as IDBFactory;
    expect(await openIndexedDbStore(broken)).toBeNull();
  });
});
