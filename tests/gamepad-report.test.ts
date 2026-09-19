import { describe, expect, it } from 'vitest';
import {
  formatGamepad,
  formatReport,
  mappingLabel,
  snapshotGamepad,
  updateHistory,
  type GamepadLike,
  type PadReading,
} from '../src/engine/gamepad-report';

const pad: GamepadLike = {
  index: 0,
  id: '8BitDo Pro 2 (Vendor: 2dc8 Product: 6003)',
  mapping: 'standard',
  connected: true,
  buttons: [
    { pressed: false, value: 0 },
    { pressed: true, value: 1 },
    { pressed: true, value: 0.5 },
  ],
  axes: [0, -1, 0.25],
};

function reading(gp: GamepadLike): PadReading {
  const snapshot = snapshotGamepad(gp);
  return { snapshot, history: updateHistory(undefined, snapshot) };
}

describe('snapshotGamepad', () => {
  it('copies the values so later changes to the source do not leak in', () => {
    const buttons = [{ pressed: true, value: 1 }];
    const axes = [0.5];
    const source: GamepadLike = { ...pad, buttons, axes };
    const snapshot = snapshotGamepad(source);
    buttons[0] = { pressed: false, value: 0 };
    axes[0] = -1;
    expect(snapshot.buttons).toEqual([{ pressed: true, value: 1 }]);
    expect(snapshot.axes).toEqual([0.5]);
    expect(snapshot.id).toBe(pad.id);
    expect(snapshot.index).toBe(0);
    expect(snapshot.mapping).toBe('standard');
    expect(snapshot.connected).toBe(true);
  });
});

describe('mappingLabel', () => {
  it('names the empty mapping as non-standard', () => {
    expect(mappingLabel('')).toBe('(none, non-standard)');
    expect(mappingLabel('standard')).toBe('standard');
  });
});

describe('updateHistory', () => {
  it('starts from the first snapshot', () => {
    const history = updateHistory(undefined, snapshotGamepad(pad));
    expect(history).toEqual({
      pressedEver: [1, 2],
      axisMin: [0, -1, 0.25],
      axisMax: [0, -1, 0.25],
    });
  });

  it('remembers buttons pressed earlier and widens the axis range', () => {
    const first = updateHistory(undefined, snapshotGamepad(pad));
    const later = snapshotGamepad({
      ...pad,
      buttons: [
        { pressed: true, value: 1 },
        { pressed: false, value: 0 },
        { pressed: false, value: 0 },
      ],
      axes: [1, 0, -0.5],
    });
    expect(updateHistory(first, later)).toEqual({
      pressedEver: [0, 1, 2],
      axisMin: [0, -1, -0.5],
      axisMax: [1, 0, 0.25],
    });
  });
});

describe('formatGamepad', () => {
  it('prints identity, live values and history for a standard pad', () => {
    expect(formatGamepad(reading(pad))).toBe(
      [
        '--- Gamepad 0 ---',
        'id: 8BitDo Pro 2 (Vendor: 2dc8 Product: 6003)',
        'mapping: standard',
        'buttons: 3',
        'axes: 3',
        'pressed now: 1, 2',
        'button values: 0=0.00 1=1.00 2=0.50',
        'axis values: 0=0.00 1=-1.00 2=0.25',
        'ever pressed: 1, 2',
        'axis range seen: 0=0.00..0.00 1=-1.00..-1.00 2=0.25..0.25',
      ].join('\n'),
    );
  });

  it('labels a non-standard mapping and shows (none) when nothing is pressed', () => {
    const text = formatGamepad(
      reading({ ...pad, mapping: '', buttons: [{ pressed: false, value: 0 }], axes: [] }),
    );
    expect(text).toContain('mapping: (none, non-standard)');
    expect(text).toContain('pressed now: (none)');
    expect(text).toContain('ever pressed: (none)');
  });
});

describe('formatReport', () => {
  const env = { date: '2026-09-19T12:00:00.000Z', userAgent: 'TestAgent/1.0' };

  it('states clearly when no gamepad is connected', () => {
    expect(formatReport(env, [])).toBe(
      [
        'Boss Trainer controller report',
        'date: 2026-09-19T12:00:00.000Z',
        'user agent: TestAgent/1.0',
        'gamepads: 0',
        '',
        'No gamepad detected. Press a button on the controller to wake it.',
      ].join('\n'),
    );
  });

  it('starts with the environment and includes every gamepad', () => {
    const second: GamepadLike = { ...pad, index: 1, id: 'Other Pad', mapping: '' };
    const text = formatReport(env, [reading(pad), reading(second)]);
    expect(
      text.startsWith(
        [
          'Boss Trainer controller report',
          'date: 2026-09-19T12:00:00.000Z',
          'user agent: TestAgent/1.0',
          'gamepads: 2',
          '',
          '--- Gamepad 0 ---',
        ].join('\n'),
      ),
    ).toBe(true);
    expect(text).toContain('--- Gamepad 1 ---');
    expect(text).toContain('id: Other Pad');
  });
});
