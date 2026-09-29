import type { EnrageDef } from '../game/fight';
import type { BossDef } from './schema';

/** One of the two bosses of a pair: which boss, and how much of its health it keeps in this pair (1 is as written in the boss file). */
export interface PairMember {
  boss: string;
  healthScale: number;
}

/** Two existing bosses that fight together. `bosses[0]` is the primary boss (its arena and backdrop are used). `enrage` is how much angrier the survivor gets when its partner falls, or null for no change. */
export interface PairDef {
  id: string;
  name: string;
  bosses: readonly [PairMember, PairMember];
  enrage: EnrageDef | null;
}

export class PairFormatError extends Error {
  constructor(path: string, message: string) {
    super(`Pair data error at ${path}: ${message}`);
    this.name = 'PairFormatError';
  }
}

type Obj = Record<string, unknown>;

function fail(path: string, message: string): never {
  throw new PairFormatError(path, message);
}

function object(value: unknown, path: string): Obj {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) fail(path, 'expected an object');
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

function num(value: unknown, path: string, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(path, 'expected a number');
  if (value < min) fail(path, `must be at least ${min}`);
  if (value > max) fail(path, `must be at most ${max}`);
  return value;
}

const HEALTH_SCALE = { min: 0.2, max: 2 };
const GAP_SCALE = { min: 0.1, max: 1 };
const WALK_SCALE = { min: 1, max: 3 };

function parseMember(data: unknown, path: string, boss: (id: string) => BossDef | undefined): PairMember {
  const o = object(data, path);
  const id = text(o.boss, `${path}.boss`);
  if (boss(id) === undefined) fail(`${path}.boss`, `no boss has the id "${id}"`);
  const healthScale = num(o.healthScale, `${path}.healthScale`, HEALTH_SCALE.min, HEALTH_SCALE.max);
  return { boss: id, healthScale };
}

function parseEnrage(data: unknown, path: string): EnrageDef {
  const o = object(data, path);
  return {
    gapScale: num(o.gapScale, `${path}.gapScale`, GAP_SCALE.min, GAP_SCALE.max),
    walkScale: num(o.walkScale, `${path}.walkScale`, WALK_SCALE.min, WALK_SCALE.max),
  };
}

/**
 * Checks a pair file and returns it, or throws a `PairFormatError` naming the first problem.
 * `boss` looks a boss up by id and must return `undefined` for an unknown id (not fall back to another boss).
 */
export function parsePair(data: unknown, boss: (id: string) => BossDef | undefined): PairDef {
  const o = object(data, 'pair');
  const id = text(o.id, 'pair.id');
  if (id === 'generated' || boss(id) !== undefined) {
    fail('pair.id', `"${id}" is already used by a boss (a pair id is stored where a boss id is)`);
  }
  const name = text(o.name, 'pair.name');
  const members = list(o.bosses, 'pair.bosses');
  if (members.length !== 2) fail('pair.bosses', 'expected exactly two bosses');
  const first = parseMember(members[0], 'pair.bosses[0]', boss);
  const second = parseMember(members[1], 'pair.bosses[1]', boss);
  if (second.boss === first.boss) {
    fail('pair.bosses[1].boss', `must be a different boss from the first ("${first.boss}")`);
  }
  const enrage = o.enrage === undefined || o.enrage === null ? null : parseEnrage(o.enrage, 'pair.enrage');
  return { id, name, bosses: [first, second], enrage };
}
