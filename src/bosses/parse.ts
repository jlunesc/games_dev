import type {
  AttackDef,
  AttackMove,
  BossDef,
  CounterDef,
  HitWindow,
  PhaseDef,
  Pose,
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

const POSES: readonly Pose[] = ['raised', 'sideways', 'back', 'down'];

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
  return hit;
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
  if (hits.length === 0) fail(`${path}.hits`, 'needs at least one hit window');
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
    if (move.to <= move.from || move.from < windup || move.to > windup + active) {
      fail(`${path}.move`, 'must lie inside the active updates');
    }
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
  return move === undefined ? def : { ...def, move };
}

function phase(value: unknown, path: string, attackIds: ReadonlySet<string>): PhaseDef {
  const o = object(value, path);
  const attacks = list(o.attacks, `${path}.attacks`).map((entry, i) => {
    const e = object(entry, `${path}.attacks[${i}]`);
    const id = text(e.id, `${path}.attacks[${i}].id`);
    if (!attackIds.has(id)) fail(`${path}.attacks[${i}].id`, `unknown attack "${id}"`);
    return { id, weight: num(e.weight, `${path}.attacks[${i}].weight`, { min: 0.0001 }) };
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
  return opening === undefined ? result : { ...result, opening };
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

  return {
    id: text(o.id, 'boss.id'),
    name: text(o.name, 'boss.name'),
    width: num(o.width, 'boss.width', { min: 1 }),
    height: num(o.height, 'boss.height', { min: 1 }),
    startX: num(o.startX, 'boss.startX', { min: 0 }),
    maxHp: num(o.maxHp, 'boss.maxHp', { min: 1, integer: true }),
    spacing,
    approachTimeout: num(o.approachTimeout, 'boss.approachTimeout', { min: 1, integer: true }),
    predictability: num(o.predictability, 'boss.predictability', { min: 0, max: 1 }),
    counter,
    transitionTicks: num(o.transitionTicks, 'boss.transitionTicks', { min: 0, integer: true }),
    attacks,
    phases,
  };
}
