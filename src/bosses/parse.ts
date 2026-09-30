import { PLAYER, WORLD } from '../game/params';
import type {
  BlinkDef,
  ArenaDef,
  ArcDef,
  ArenaPiece,
  AttackDef,
  AttackMove,
  BoltDef,
  BossDef,
  CounterDef,
  DiveDef,
  DiveShape,
  FlightDef,
  HitWindow,
  LeapDef,
  LeapTarget,
  PhaseDef,
  Pose,
  EruptionDef,
  ShotDef,
} from './schema';

/** A boss file is broken. The message names the exact place, for example `boss.attacks[1].range`. */
export class BossFormatError extends Error {
  constructor(path: string, message: string) {
    super(`Boss data error at ${path}: ${message}`);
    this.name = 'BossFormatError';
  }
}

type Obj = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new BossFormatError(path, message);
}

function object(value: unknown, path: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'expected an object');
  }
  return value as Obj;
}

function list(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) fail(path, 'expected a list');
  return value;
}

function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) fail(path, 'expected a non-empty text');
  return value;
}

interface NumberRule {
  min?: number;
  max?: number;
  integer?: boolean;
}

function num(value: unknown, path: string, rule: NumberRule = {}): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a number');
  if (rule.integer && !Number.isInteger(value)) fail(path, 'expected a whole number');
  if (rule.min !== undefined && value < rule.min) fail(path, `must be at least ${rule.min}`);
  if (rule.max !== undefined && value > rule.max) fail(path, `must be at most ${rule.max}`);
  return value;
}

const POSES: readonly Pose[] = ['raised', 'sideways', 'back', 'down', 'crouch'];

const LEAP_TARGETS: readonly LeapTarget[] = ['player', 'forward', 'back'];
const DIVE_SHAPES: readonly DiveShape[] = ['plunge', 'swoop'];

/** The highest a swing can reach (a jump at its peak, the swing box above the body's middle): a resting flight must stay above it. */
const HIGHEST_SWING = Math.ceil(
  PLAYER.jumpSpeed ** 2 / (2 * PLAYER.gravity) + PLAYER.height / 2 + PLAYER.attack.height / 2,
);

function hitWindow(value: unknown, path: string): HitWindow {
  const o = object(value, path);
  const hit: HitWindow = {
    from: num(o.from, `${path}.from`, { min: 0, integer: true }),
    to: num(o.to, `${path}.to`, { min: 1, integer: true }),
    x0: num(o.x0, `${path}.x0`),
    x1: num(o.x1, `${path}.x1`),
    bottom: num(o.bottom, `${path}.bottom`, { min: 0 }),
    top: num(o.top, `${path}.top`),
  };
  if (hit.to <= hit.from) fail(path, '"to" must be after "from"');
  if (hit.x1 <= hit.x0) fail(path, '"x1" must be greater than "x0"');
  if (hit.top <= hit.bottom) fail(path, '"top" must be greater than "bottom"');
  if (o.both !== undefined) {
    if (typeof o.both !== 'boolean') fail(`${path}.both`, 'expected true or false');
    hit.both = o.both;
  }
  return hit;
}

const MAX_SHOTS = 8;

/** The shots of an attack: each fires inside the active updates; an arc's flight or an eruption's delay may run on past them. */
function shotList(value: unknown, path: string, windup: number, active: number): ShotDef[] {
  const entries = list(value, path);
  if (entries.length === 0 || entries.length > MAX_SHOTS) fail(path, `needs 1 to ${MAX_SHOTS} shots`);
  return entries.map((entry, i): ShotDef => {
    const at = `${path}[${i}]`;
    const o = object(entry, at);
    const kind = text(o.kind, `${at}.kind`);
    const fires = num(o.at, `${at}.at`, { min: 0, integer: true });
    if (fires < windup || fires >= windup + active) fail(`${at}.at`, 'must lie inside the active updates');
    if (kind === 'bolt') {
      const bolt: BoltDef = {
        kind,
        at: fires,
        height: num(o.height, `${at}.height`, { min: 0, max: 200 }),
        size: num(o.size, `${at}.size`, { min: 10, max: 80 }),
        speed: num(o.speed, `${at}.speed`, { min: 100, max: 1600 }),
      };
      if (o.dir !== undefined) {
        if (o.dir !== 'forward' && o.dir !== 'back') fail(`${at}.dir`, 'must be "forward" or "back"');
        bolt.dir = o.dir;
      }
      if (o.aim !== undefined) {
        if (typeof o.aim !== 'boolean') fail(`${at}.aim`, 'expected true or false');
        if (o.aim && o.dir !== undefined) fail(`${at}.dir`, 'an aimed bolt picks its own way');
        bolt.aim = o.aim;
      }
      return bolt;
    }
    if (kind === 'eruption') {
      const eruption: EruptionDef = {
        kind,
        at: fires,
        offset: num(o.offset, `${at}.offset`, { min: -800, max: 800 }),
        width: num(o.width, `${at}.width`, { min: 40, max: 600 }),
        delay: num(o.delay, `${at}.delay`, { min: 8, max: 200, integer: true }),
        burst: num(o.burst, `${at}.burst`, { min: 3, max: 30, integer: true }),
      };
      if (o.linger !== undefined) eruption.linger = num(o.linger, `${at}.linger`, { min: 1, max: 600, integer: true });
      return eruption;
    }
    if (kind === 'arc') {
      const target = text(o.target, `${at}.target`);
      if (!LEAP_TARGETS.includes(target as LeapTarget)) {
        fail(`${at}.target`, `must be one of ${LEAP_TARGETS.join(', ')}`);
      }
      const arc: ArcDef = {
        kind,
        at: fires,
        flight: num(o.flight, `${at}.flight`, { min: 20, max: 120, integer: true }),
        peak: num(o.peak, `${at}.peak`, { min: 60, max: 400 }),
        target: target as LeapTarget,
        radius: num(o.radius, `${at}.radius`, { min: 10, max: 200 }),
        burst: num(o.burst, `${at}.burst`, { min: 3, max: 30, integer: true }),
      };
      if (target !== 'player') arc.distance = num(o.distance, `${at}.distance`, { min: 1 });
      else if (o.distance !== undefined) fail(`${at}.distance`, 'is only for "forward" and "back"');
      return arc;
    }
    return fail(`${at}.kind`, 'must be "bolt", "arc" or "eruption"');
  });
}

function attack(value: unknown, path: string): AttackDef {
  const o = object(value, path);
  const pose = text(o.pose, `${path}.pose`);
  if (!POSES.includes(pose as Pose)) fail(`${path}.pose`, `must be one of ${POSES.join(', ')}`);
  const cls = text(o.class, `${path}.class`);
  if (cls !== 'counterable' && cls !== 'mustDodge') {
    fail(`${path}.class`, 'must be "counterable" or "mustDodge"');
  }
  const windup = num(o.windup, `${path}.windup`, { min: 1, integer: true });
  const active = num(o.active, `${path}.active`, { min: 1, integer: true });
  const recovery = num(o.recovery, `${path}.recovery`, { min: 0, integer: true });

  const rangeObject = object(o.range, `${path}.range`);
  const range = {
    min: num(rangeObject.min, `${path}.range.min`, { min: 0 }),
    max: num(rangeObject.max, `${path}.range.max`, { min: 0 }),
  };
  if (range.max <= range.min) fail(`${path}.range`, '"max" must be greater than "min"');

  const hits = list(o.hits, `${path}.hits`).map((entry, i) => hitWindow(entry, `${path}.hits[${i}]`));
  hits.forEach((hit, i) => {
    if (hit.from < windup || hit.to > windup + active) {
      fail(`${path}.hits[${i}]`, 'must lie inside the active updates');
    }
  });

  let move: AttackMove | undefined;
  if (o.move !== undefined) {
    const m = object(o.move, `${path}.move`);
    move = {
      from: num(m.from, `${path}.move.from`, { min: 0, integer: true }),
      to: num(m.to, `${path}.move.to`, { min: 1, integer: true }),
      speed: num(m.speed, `${path}.move.speed`, { min: 1 }),
    };
    if (m.dir !== undefined) {
      if (m.dir !== 'forward' && m.dir !== 'back') {
        fail(`${path}.move.dir`, 'must be "forward" or "back"');
      }
      move.dir = m.dir;
    }
    if (move.to <= move.from || move.from < windup || move.to > windup + active) {
      fail(`${path}.move`, 'must lie inside the active updates');
    }
  }

  let leap: LeapDef | undefined;
  if (o.leap !== undefined) {
    const l = object(o.leap, `${path}.leap`);
    const from = num(l.from, `${path}.leap.from`, { min: 0, integer: true });
    const to = num(l.to, `${path}.leap.to`, { min: 1, integer: true });
    const height = num(l.height, `${path}.leap.height`, { min: 1 });
    const target = text(l.target, `${path}.leap.target`);
    if (!LEAP_TARGETS.includes(target as LeapTarget)) {
      fail(`${path}.leap.target`, `must be one of ${LEAP_TARGETS.join(', ')}`);
    }
    leap = { from, to, height, target: target as LeapTarget };
    if (target !== 'player') {
      leap.distance = num(l.distance, `${path}.leap.distance`, { min: 1 });
    }
    if (to <= from || from < windup || to > windup + active) {
      fail(`${path}.leap`, 'must lie inside the active updates');
    }
    if (l.hang !== undefined) {
      leap.hang = num(l.hang, `${path}.leap.hang`, { min: 1, integer: true });
      if (leap.hang > to - from - 2) fail(`${path}.leap.hang`, 'must leave at least one update to rise and one to fall');
    }
    if (move !== undefined && from < move.to && move.from < to) {
      fail(`${path}.leap`, 'must not overlap the move');
    }
  }

  let dive: DiveDef | undefined;
  if (o.dive !== undefined) {
    if (leap !== undefined) fail(`${path}.dive`, 'an attack cannot have both a leap and a dive');
    const d = object(o.dive, `${path}.dive`);
    const from = num(d.from, `${path}.dive.from`, { min: 0, integer: true });
    const to = num(d.to, `${path}.dive.to`, { min: 1, integer: true });
    const shape = text(d.shape, `${path}.dive.shape`);
    if (!DIVE_SHAPES.includes(shape as DiveShape)) {
      fail(`${path}.dive.shape`, `must be one of ${DIVE_SHAPES.join(', ')}`);
    }
    const target = text(d.target, `${path}.dive.target`);
    if (!LEAP_TARGETS.includes(target as LeapTarget)) {
      fail(`${path}.dive.target`, `must be one of ${LEAP_TARGETS.join(', ')}`);
    }
    dive = { from, to, shape: shape as DiveShape, target: target as LeapTarget };
    if (target !== 'player') dive.distance = num(d.distance, `${path}.dive.distance`, { min: 1 });
    if (to <= from || from < windup || to > windup + active) {
      fail(`${path}.dive`, 'must lie inside the active updates');
    }
    if (shape === 'swoop') {
      dive.low = num(d.low, `${path}.dive.low`, { min: 1, integer: true });
      if (dive.low > to - from - 2) fail(`${path}.dive.low`, 'must leave at least one update to fall and one to climb');
    } else if (d.low !== undefined) {
      fail(`${path}.dive.low`, 'only a swoop has "low"');
    }
    if (move !== undefined && from < move.to && move.from < to) {
      fail(`${path}.dive`, 'must not overlap the move');
    }
  }

  const shots = o.shots === undefined ? undefined : shotList(o.shots, `${path}.shots`, windup, active);
  if (shots !== undefined && cls !== 'mustDodge') {
    fail(`${path}.class`, 'an attack with shots must be "mustDodge"');
  }

  let hold: number | undefined;
  if (o.hold !== undefined) {
    hold = num(o.hold, `${path}.hold`, { min: 1, max: 60, integer: true });
    if (cls !== 'mustDodge') fail(`${path}.hold`, 'only a "mustDodge" attack can hold');
    if (shots !== undefined) fail(`${path}.hold`, 'an attack with shots cannot hold');
    if (windup < 2) fail(`${path}.hold`, 'needs a wind-up of at least 2');
  }

  let blink: BlinkDef | undefined;
  if (o.blink !== undefined) {
    const k = object(o.blink, `${path}.blink`);
    const from = num(k.from, `${path}.blink.from`, { min: 1, integer: true });
    const to = num(k.to, `${path}.blink.to`, { min: 2, integer: true });
    const target = text(k.target, `${path}.blink.target`);
    if (!LEAP_TARGETS.includes(target as LeapTarget)) {
      fail(`${path}.blink.target`, `must be one of ${LEAP_TARGETS.join(', ')}`);
    }
    blink = { from, to, target: target as LeapTarget };
    if (target === 'player') {
      if (k.distance !== undefined) blink.distance = num(k.distance, `${path}.blink.distance`, { min: 0 });
    } else {
      blink.distance = num(k.distance, `${path}.blink.distance`, { min: 1 });
    }
    if (to <= from || to > windup + active) fail(`${path}.blink`, 'must end inside the attack');
    if (cls !== 'mustDodge') fail(`${path}.blink`, 'only a "mustDodge" attack can blink');
    if (leap !== undefined || dive !== undefined || shots !== undefined || hold !== undefined) {
      fail(`${path}.blink`, 'an attack with a blink cannot also leap, dive, shoot or hold');
    }
    if (move !== undefined && from < move.to && move.from < to) fail(`${path}.blink`, 'must not overlap the move');
    hits.forEach((hit, i) => {
      if (hit.from < to) fail(`${path}.hits[${i}]`, 'a hit window cannot start while the boss is gone (it must start at "blink.to" or later)');
    });
  }

  if (hits.length === 0 && move === undefined && leap === undefined && dive === undefined && shots === undefined && blink === undefined) {
    fail(`${path}.hits`, 'needs at least one hit window, a move, a leap, a dive or shots');
  }

  const def: AttackDef = {
    id: text(o.id, `${path}.id`),
    name: text(o.name, `${path}.name`),
    pose: pose as Pose,
    class: cls,
    damage:
      o.damage === undefined ? 1 : num(o.damage, `${path}.damage`, { min: 1, integer: true }),
    windup,
    active,
    recovery,
    range,
    hits,
  };
  return {
    ...def,
    ...(move === undefined ? {} : { move }),
    ...(leap === undefined ? {} : { leap }),
    ...(dive === undefined ? {} : { dive }),
    ...(blink === undefined ? {} : { blink }),
    ...(shots === undefined ? {} : { shots }),
    ...(hold === undefined ? {} : { hold }),
  };
}

function phase(value: unknown, path: string, attackIds: ReadonlySet<string>): PhaseDef {
  const o = object(value, path);
  const attacks = list(o.attacks, `${path}.attacks`).map((entry, i) => {
    const e = object(entry, `${path}.attacks[${i}]`);
    const id = text(e.id, `${path}.attacks[${i}].id`);
    if (!attackIds.has(id)) fail(`${path}.attacks[${i}].id`, `unknown attack "${id}"`);
    const heavy = e.heavy;
    if (heavy !== undefined && typeof heavy !== 'boolean') fail(`${path}.attacks[${i}].heavy`, 'expected true or false');
    return {
      id,
      weight: num(e.weight, `${path}.attacks[${i}].weight`, { min: 0.0001 }),
      ...(heavy === true ? { heavy: true } : {}),
    };
  });
  if (attacks.length === 0) fail(`${path}.attacks`, 'needs at least one attack');

  let opening: string | undefined;
  if (o.opening !== undefined) {
    opening = text(o.opening, `${path}.opening`);
    if (!attackIds.has(opening)) fail(`${path}.opening`, `unknown attack "${opening}"`);
  }

  const result: PhaseDef = {
    name: text(o.name, `${path}.name`),
    startsAtHpFraction: num(o.startsAtHpFraction, `${path}.startsAtHpFraction`, {
      min: 0.0001,
      max: 1,
    }),
    attacks,
    gap: num(o.gap, `${path}.gap`, { min: 0, integer: true }),
    maxChain: num(o.maxChain, `${path}.maxChain`, { min: 1, integer: true }),
    chainChance: num(o.chainChance, `${path}.chainChance`, { min: 0, max: 1 }),
    walkSpeed: num(o.walkSpeed, `${path}.walkSpeed`, { min: 1 }),
    retreatSpeed: num(o.retreatSpeed, `${path}.retreatSpeed`, { min: 1 }),
  };
  let combos: string[][] | undefined;
  if (o.combos !== undefined) {
    const firsts = new Set<string>();
    const parsed = list(o.combos, `${path}.combos`).map((entry, i) => {
      const at = `${path}.combos[${i}]`;
      const steps = list(entry, at).map((step, j) => {
        const id = text(step, `${at}[${j}]`);
        if (!attackIds.has(id)) fail(`${at}[${j}]`, `unknown attack "${id}"`);
        return id;
      });
      if (steps.length < 2 || steps.length > 4) fail(at, 'needs 2 to 4 steps');
      const first = steps[0]!;
      if (!attacks.some((a) => a.id === first)) fail(`${at}[0]`, 'the first step must be one of the phase attacks');
      if (firsts.has(first)) fail(at, 'two combos start with the same attack');
      firsts.add(first);
      return steps;
    });
    if (parsed.length > 0) combos = parsed;
  }

  let spacing: { min: number; max: number } | undefined;
  if (o.spacing !== undefined) {
    const sp = object(o.spacing, `${path}.spacing`);
    spacing = {
      min: num(sp.min, `${path}.spacing.min`, { min: 0 }),
      max: num(sp.max, `${path}.spacing.max`, { min: 0 }),
    };
    if (spacing.max <= spacing.min) fail(`${path}.spacing`, '"max" must be greater than "min"');
  }

  return {
    ...result,
    ...(opening === undefined ? {} : { opening }),
    ...(combos === undefined ? {} : { combos }),
    ...(spacing === undefined ? {} : { spacing }),
  };
}

const ARENA_MAX_PIECES = 6;
const ARENA_WIDTH = { min: 40, max: 600 };
const ARENA_HEIGHT = {
  platforms: { min: 40, max: 300 },
  covers: { min: 20, max: 400 },
} as const;

/** The horizontal span of a piece, `[left, right)`. */
const span = (p: ArenaPiece): [number, number] => [p.x - p.width / 2, p.x + p.width / 2];

const spansOverlap = (a: ArenaPiece, b: ArenaPiece): boolean => {
  const [al, ar] = span(a);
  const [bl, br] = span(b);
  return al < br && bl < ar;
};

function arenaPieces(value: unknown, path: string, kind: 'platforms' | 'covers'): ArenaPiece[] {
  if (value === undefined) return [];
  const entries = list(value, path);
  if (entries.length > ARENA_MAX_PIECES) fail(path, `at most ${ARENA_MAX_PIECES} allowed`);
  const pieces = entries.map((entry, i): ArenaPiece => {
    const at = `${path}[${i}]`;
    const o = object(entry, at);
    const piece: ArenaPiece = {
      x: num(o.x, `${at}.x`),
      width: num(o.width, `${at}.width`, ARENA_WIDTH),
      height: num(o.height, `${at}.height`, ARENA_HEIGHT[kind]),
    };
    const [left, right] = span(piece);
    // The arena is WORLD.width wide, from x = 0.
    if (left < 0 || right > WORLD.width) fail(at, 'must lie inside the arena');
    return piece;
  });
  pieces.forEach((p, i) => {
    for (let j = 0; j < i; j++) {
      if (spansOverlap(p, pieces[j]!)) {
        fail(`${path}[${i}]`, `must not overlap ${path}[${j}]`);
      }
    }
  });
  return pieces;
}

function arena(value: unknown, path: string): ArenaDef {
  const o = object(value, path);
  const platforms = arenaPieces(o.platforms, `${path}.platforms`, 'platforms');
  const covers = arenaPieces(o.covers, `${path}.covers`, 'covers');
  covers.forEach((c, i) => {
    const [left, right] = span(c);
    if (left <= PLAYER.startX && PLAYER.startX < right) {
      fail(`${path}.covers[${i}]`, "must not contain the player's start");
    }
  });
  platforms.forEach((p, i) => {
    if (covers.some((c) => spansOverlap(p, c))) {
      fail(`${path}.platforms[${i}]`, 'must not overlap a cover');
    }
  });
  return { platforms, covers };
}

function flight(value: unknown, path: string, bossHeight: number): FlightDef {
  const o = object(value, path);
  const height = num(o.height, `${path}.height`, { min: HIGHEST_SWING + 10 });
  const rise = num(o.rise, `${path}.rise`, { min: 20, max: 1000 });
  if (height + bossHeight > WORLD.floorY - 20) fail(`${path}.height`, 'the boss must fit inside the arena when it hangs this high');
  return { height, rise };
}

/** Checks a boss file and returns it typed. Throws a `BossFormatError` naming the first problem found. */
export function parseBoss(data: unknown): BossDef {
  const o = object(data, 'boss');

  const attacks = list(o.attacks, 'boss.attacks').map((entry, i) =>
    attack(entry, `boss.attacks[${i}]`),
  );
  if (attacks.length === 0) fail('boss.attacks', 'needs at least one attack');
  const ids = new Set<string>();
  attacks.forEach((a, i) => {
    if (ids.has(a.id)) fail(`boss.attacks[${i}].id`, `"${a.id}" is used twice`);
    ids.add(a.id);
  });

  const phases = list(o.phases, 'boss.phases').map((entry, i) =>
    phase(entry, `boss.phases[${i}]`, ids),
  );
  if (phases.length === 0) fail('boss.phases', 'needs at least one phase');
  phases.forEach((p, i) => {
    if (i === 0 && p.startsAtHpFraction !== 1) {
      fail('boss.phases[0].startsAtHpFraction', 'the first phase must start at 1 (full health)');
    }
    const before = phases[i - 1];
    if (before !== undefined && p.startsAtHpFraction >= before.startsAtHpFraction) {
      fail(`boss.phases[${i}].startsAtHpFraction`, 'must be lower than the previous phase');
    }
  });

  const spacingObject = object(o.spacing, 'boss.spacing');
  const spacing = {
    min: num(spacingObject.min, 'boss.spacing.min', { min: 0 }),
    max: num(spacingObject.max, 'boss.spacing.max', { min: 0 }),
  };
  if (spacing.max <= spacing.min) fail('boss.spacing', '"max" must be greater than "min"');

  const counterObject = object(o.counter, 'boss.counter');
  const counter: CounterDef = {
    window: num(counterObject.window, 'boss.counter.window', { min: 1, integer: true }),
    range: num(counterObject.range, 'boss.counter.range', { min: 1 }),
    staggerTicks: num(counterObject.staggerTicks, 'boss.counter.staggerTicks', {
      min: 1,
      integer: true,
    }),
    damageMultiplier: num(counterObject.damageMultiplier, 'boss.counter.damageMultiplier', {
      min: 1,
    }),
  };
  attacks.forEach((a, i) => {
    if (a.class === 'counterable' && a.windup < counter.window) {
      fail(
        'boss.counter.window',
        `is longer than the wind-up of the counterable attack boss.attacks[${i}]`,
      );
    }
  });

  const parsedArena = o.arena === undefined ? undefined : arena(o.arena, 'boss.arena');

  const bossHeight = num(o.height, 'boss.height', { min: 1 });
  const parsedFlight = o.flight === undefined ? undefined : flight(o.flight, 'boss.flight', bossHeight);
  attacks.forEach((a, i) => {
    if (a.dive !== undefined && parsedFlight === undefined) {
      fail(`boss.attacks[${i}].dive`, 'only a boss with "flight" can dive');
    }
    if (a.leap !== undefined && parsedFlight !== undefined) {
      fail(`boss.attacks[${i}].leap`, 'a boss with "flight" dives instead of leaping');
    }
  });

  const parsedTemper = o.temper === undefined ? undefined : num(o.temper, 'boss.temper', { min: 0, max: 1 });

  return {
    id: text(o.id, 'boss.id'),
    name: text(o.name, 'boss.name'),
    width: num(o.width, 'boss.width', { min: 1 }),
    height: bossHeight,
    startX: num(o.startX, 'boss.startX', { min: 0 }),
    maxHp: num(o.maxHp, 'boss.maxHp', { min: 1, integer: true }),
    spacing,
    approachTimeout: num(o.approachTimeout, 'boss.approachTimeout', { min: 1, integer: true }),
    predictability: num(o.predictability, 'boss.predictability', { min: 0, max: 1 }),
    counter,
    transitionTicks: num(o.transitionTicks, 'boss.transitionTicks', { min: 0, integer: true }),
    attacks,
    phases,
    ...(parsedFlight === undefined ? {} : { flight: parsedFlight }),
    ...(parsedTemper === undefined ? {} : { temper: parsedTemper }),
    ...(parsedArena === undefined ? {} : { arena: parsedArena }),
  };
}
