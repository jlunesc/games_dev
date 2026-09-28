import type { AttackDef, BossDef, ShotDef } from '../bosses/schema';
import { DT } from '../engine/time';
import { WORLD } from './params';
import type { GameState, ShotState } from './state';

/** Where the boss's shots come from: just in front of it. */
const muzzleX = (s: GameState, boss: BossDef): number => s.boss.x + s.boss.facing * (boss.width / 2);

/** The x an arc will land on, fixed at launch and kept inside the arena (the same targeting as a leap). */
function arcLanding(s: GameState, boss: BossDef, shot: Extract<ShotDef, { kind: 'arc' }>): number {
  const b = s.boss;
  let x = s.player.x;
  // The parser guarantees `distance` for 'forward' and 'back' (the 0 only satisfies the type).
  if (shot.target === 'forward') x = b.x + b.facing * (shot.distance ?? 0);
  if (shot.target === 'back') x = b.x - b.facing * (shot.distance ?? 0);
  const half = boss.width / 2;
  return Math.min(Math.max(x, half), WORLD.width - half);
}

/** Fires the shots of `attack` that are due on the current attack update. Called by the boss after it advances. */
export function spawnShots(s: GameState, boss: BossDef, attack: AttackDef): void {
  const b = s.boss;
  if (attack.shots === undefined) return;
  const originTick = s.tick - b.attackTick;
  for (const def of attack.shots) {
    if (def.at !== b.attackTick) continue;
    const x = muzzleX(s, boss);
    if (def.kind === 'bolt') {
      s.shots.push({
        kind: 'bolt',
        attackId: attack.id,
        originTick,
        x,
        lift: def.height,
        dir: b.facing,
        originX: x,
        size: def.size,
        speed: def.speed,
      });
    } else {
      const launchLift = boss.height * 0.6;
      s.shots.push({
        kind: 'arc',
        attackId: attack.id,
        originTick,
        x,
        lift: launchLift,
        age: 0,
        flight: def.flight,
        fromX: x,
        toX: arcLanding(s, boss, def),
        launchLift,
        peak: def.peak,
        radius: def.radius,
        burst: def.burst,
      });
    }
  }
}

/** True when a cover ahead of the bolt, tall enough to reach its bottom edge, has been reached by its front edge. */
function stoppedByCover(shot: Extract<ShotState, { kind: 'bolt' }>, boss: BossDef): boolean {
  const front = shot.x + shot.dir * (shot.size / 2);
  for (const cover of boss.arena?.covers ?? []) {
    if (cover.height <= shot.lift) continue;
    const near = shot.dir === 1 ? cover.x - cover.width / 2 : cover.x + cover.width / 2;
    if (shot.dir * (near - shot.originX) <= 0) continue;
    if (shot.dir * (front - near) >= 0) return true;
  }
  return false;
}

/** Moves every shot one update; drops bolts that left the arena or hit a cover, and arcs whose burst is over. */
export function moveShots(s: GameState, boss: BossDef): void {
  const kept: ShotState[] = [];
  for (const shot of s.shots) {
    if (shot.kind === 'bolt') {
      shot.x += shot.dir * shot.speed * DT;
      const outside = shot.x + shot.size / 2 < 0 || shot.x - shot.size / 2 > WORLD.width;
      if (outside || stoppedByCover(shot, boss)) continue;
    } else {
      shot.age += 1;
      if (shot.age >= shot.flight + shot.burst) continue;
      if (shot.age < shot.flight) {
        const p = shot.age / shot.flight;
        shot.x = shot.fromX + (shot.toX - shot.fromX) * p;
        shot.lift = shot.launchLift * (1 - p) + 4 * shot.peak * p * (1 - p);
      } else {
        shot.x = shot.toX;
        shot.lift = 0;
      }
    }
    kept.push(shot);
  }
  s.shots = kept;
}
