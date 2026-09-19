export interface GamepadLike {
  readonly index: number;
  readonly id: string;
  readonly mapping: string;
  readonly connected: boolean;
  readonly buttons: ReadonlyArray<{ readonly pressed: boolean; readonly value: number }>;
  readonly axes: ReadonlyArray<number>;
}

export interface GamepadSnapshot {
  index: number;
  id: string;
  mapping: string;
  connected: boolean;
  buttons: { pressed: boolean; value: number }[];
  axes: number[];
}

/** What a pad has done since the page loaded. Lets the report show buttons that are not held at copy time. */
export interface PadHistory {
  pressedEver: number[];
  axisMin: number[];
  axisMax: number[];
}

export interface PadReading {
  snapshot: GamepadSnapshot;
  history: PadHistory;
}

export interface ReportEnv {
  date: string;
  userAgent: string;
}

const fixed = (n: number): string => n.toFixed(2);

const list = (values: readonly number[]): string =>
  values.length > 0 ? values.join(', ') : '(none)';

export function snapshotGamepad(gp: GamepadLike): GamepadSnapshot {
  return {
    index: gp.index,
    id: gp.id,
    mapping: gp.mapping,
    connected: gp.connected,
    buttons: gp.buttons.map((b) => ({ pressed: b.pressed, value: b.value })),
    axes: [...gp.axes],
  };
}

export function mappingLabel(mapping: string): string {
  return mapping === '' ? '(none, non-standard)' : mapping;
}

export function updateHistory(
  prev: PadHistory | undefined,
  snapshot: GamepadSnapshot,
): PadHistory {
  const pressed = new Set(prev?.pressedEver ?? []);
  snapshot.buttons.forEach((b, i) => {
    if (b.pressed) pressed.add(i);
  });
  return {
    pressedEver: [...pressed].sort((a, b) => a - b),
    axisMin: snapshot.axes.map((a, i) => Math.min(a, prev?.axisMin[i] ?? a)),
    axisMax: snapshot.axes.map((a, i) => Math.max(a, prev?.axisMax[i] ?? a)),
  };
}

export function formatGamepad({ snapshot: s, history: h }: PadReading): string {
  const pressedNow = s.buttons.flatMap((b, i) => (b.pressed ? [i] : []));
  const ranges = s.axes.map(
    (_, i) => `${i}=${fixed(h.axisMin[i] ?? 0)}..${fixed(h.axisMax[i] ?? 0)}`,
  );
  return [
    `--- Gamepad ${s.index} ---`,
    `id: ${s.id}`,
    `mapping: ${mappingLabel(s.mapping)}`,
    `buttons: ${s.buttons.length}`,
    `axes: ${s.axes.length}`,
    `pressed now: ${list(pressedNow)}`,
    `button values: ${s.buttons.map((b, i) => `${i}=${fixed(b.value)}`).join(' ')}`,
    `axis values: ${s.axes.map((a, i) => `${i}=${fixed(a)}`).join(' ')}`,
    `ever pressed: ${list(h.pressedEver)}`,
    `axis range seen: ${ranges.join(' ')}`,
  ].join('\n');
}

export function formatReport(env: ReportEnv, readings: readonly PadReading[]): string {
  const header = [
    'Boss Trainer controller report',
    `date: ${env.date}`,
    `user agent: ${env.userAgent}`,
    `gamepads: ${readings.length}`,
  ];
  const body =
    readings.length === 0
      ? ['No gamepad detected. Press a button on the controller to wake it.']
      : readings.map(formatGamepad);
  return [...header, '', ...body.flatMap((part, i) => (i === 0 ? [part] : ['', part]))].join('\n');
}
