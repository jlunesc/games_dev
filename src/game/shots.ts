import type { AttackDef, BossDef, ShotDef } from '../bosses/schema';
import { DT } from '../engine/time';
import { PLAYER, WORLD } from './params';
import { bossAt, type BossState, type GameState, type ShotState } from './state';

/** Where a shot leaving the boss towards `dir` starts: at that edge of its body. */
const muzzleX = (b: BossState, boss: BossDef, dir: 1 | -1): number => b.x + dir * (boss.width / 2);

/** The x an arc will land on, fixed at launch and kept inside the arena (the same targeting as a leap). */
function arcLanding(s: GameState, b: BossState, boss: BossDef, shot: Extract<ShotDef, { kind: 'arc' }>): number {
  let x = s.player.x;
  // The parser guarantees `distance` for 'forward' and 'back' (the 0 only satisfies the type).
  if (shot.target === 'forward') x = b.x + b.facing * (shot.distance ?? 0);
  if (shot.target === 'back') x = b.x - b.facing * (shot.distance ?? 0);
  const half = boss.width / 2;
  return Math.min(Math.max(x, half), WORLD.width - half);
}

/** Fires the shots of `attack` that are due on the current attack update. Called by the boss after it advances. */
export function spawnShots(s: GameState, boss: BossDef, attack: AttackDef, index = 0): void {
  const b = bossAt(s, index);
  if (attack.shots === undefined) return;
  const originTick = s.tick - b.attackTick;
  // Only a partner's shots carry an owner, so the shots of a one-boss fight are exactly what they always were.
  const owner = index > 0 ? { owner: index } : {};
  for (const def of attack.shots) {
    if (def.at !== b.attackTick) continue;
    if (def.kind === 'eruption') {
      const half = def.width / 2;
      s.shots.push({
        kind: 'eruption',
        attackId: attack.id,
        originTick,
        x: Math.min(Math.max(s.player.x + def.offset, half), WORLD.width - half),
        lift: 0,
        age: 0,
        width: def.width,
        delay: def.delay,
        burst: def.burst,
        ...owner,
      });
      continue;
    }
    if (def.kind === 'bolt') {
      // Fired from the boss's body: a hovering boss fires from up in the air.
      const lift = def.height + b.lift;
      let dir: 1 | -1 = def.dir === 'back' ? (b.facing === 1 ? -1 : 1) : b.facing;
      let speed = def.speed;
      let climb = 0;
      if (def.aim === true) {
        // A straight line at the player's body as it is now. Square roots are exact in every engine, so a replay agrees.
        const dx = s.player.x - muzzleX(b, boss, b.facing);
        const dy = WORLD.floorY - s.player.y + PLAYER.height / 2 - (lift + def.size / 2);
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 1) {
          dir = dx === 0 ? b.facing : dx > 0 ? 1 : -1;
          speed = (def.speed * Math.abs(dx)) / length;
          climb = (def.speed * dy) / length;
        }
      }
      const x = muzzleX(b, boss, dir);
      s.shots.push({
        kind: 'bolt',
        attackId: attack.id,
        originTick,
        x,
        lift,
        dir,
        originX: x,
        size: def.size,
        speed,
        climb,
        ...owner,
      });
    } else {
      const x = muzzleX(b, boss, b.facing);
      const launchLift = boss.height * 0.6 + b.lift;
      s.shots.push({
        kind: 'arc',
        attackId: attack.id,
        originTick,
        x,
        lift: launchLift,
        age: 0,
        flight: def.flight,
        fromX: x,
        toX: arcLanding(s, b, boss, def),
        launchLift,
        peak: def.peak,
        radius: def.radius,
        burst: def.burst,
        ...owner,
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

/** Moves every shot one update; drops bolts that left the arena or hit a cover, and arcs and eruptions whose burst is over. */
export function moveShots(s: GameState, boss: BossDef): void {
  const kept: ShotState[] = [];
  for (const shot of s.shots) {
    if (shot.kind === 'bolt') {
      shot.x += shot.dir * shot.speed * DT;
      shot.lift += shot.climb * DT;
      const outside = shot.x + shot.size / 2 < 0 || shot.x - shot.size / 2 > WORLD.width;
      // A bolt flying down is gone once it reaches the floor; one flying up is gone above the world.
      const landed = shot.climb < 0 && shot.lift < 0;
      if (outside || landed || shot.lift > WORLD.height || stoppedByCover(shot, boss)) continue;
    } else if (shot.kind === 'eruption') {
      shot.age += 1;
      if (shot.age >= shot.delay + shot.burst) continue;
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
