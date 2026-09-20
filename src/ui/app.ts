import { EMBER_DUELIST } from '../bosses';
import {
  NO_INPUT,
  NO_PRESSES,
  addPresses,
  applyPresses,
  type InputFrame,
  type PendingPresses,
} from '../engine/input-frame';
import {
  NOTHING_HELD,
  sampleInput,
  selectProfile,
  type HeldButtons,
  type ProfileSelection,
} from '../engine/input-profile';
import { advanceHold } from '../engine/hold';
import { planUpdates } from '../engine/loop';
import { GAME } from '../game/params';
import { step } from '../game/step';
import { createInitialState, type GameState } from '../game/state';
import { createSound } from './audio';
import { mountControllerScreen } from './controller-screen';
import { el } from './dom';
import {
  NO_FEEDBACK,
  advanceFeedback,
  applyEvents,
  freezeFor,
  type FeedbackState,
} from './feedback';
import { drawFrame } from './render';

type Screen = 'start' | 'fight' | 'test';

function firstPad(): Gamepad | null {
  if (typeof navigator.getGamepads !== 'function') return null;
  for (const pad of navigator.getGamepads()) {
    if (pad !== null && pad.connected) return pad;
  }
  return null;
}

function describeController(pad: Gamepad | null, selection: ProfileSelection | null): string {
  if (pad === null || selection === null) {
    return 'No controller detected. Press a button on your controller.';
  }
  if (selection.kind === 'unsupported') {
    return `This controller (${selection.id}) has no button profile yet, so the game cannot use it. Open the controller test and send me the report.`;
  }
  return `Controller: ${selection.profile.name}`;
}

/** A fresh seed for a fight, from the browser's random source (outside the simulation, which stays reproducible). */
function newSeed(): number {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return values[0] ?? 1;
}

export function mountApp(root: HTMLElement): void {
  const canvas = el('canvas', 'game-canvas');
  canvas.hidden = true;
  const maybeContext = canvas.getContext('2d');
  if (maybeContext === null) throw new Error('Canvas 2D is not available');
  const context: CanvasRenderingContext2D = maybeContext;
  const panel = el('div', 'panel');
  const banner = el('p', 'banner');
  banner.hidden = true;
  const leaveHint = el('p', 'banner leave', 'Keep holding to leave the fight…');
  leaveHint.hidden = true;
  root.replaceChildren(canvas, panel, banner, leaveHint);

  const sound = createSound();
  // A phone only counts some events as a tap for sound: touch needs pointerup or click, not just pointerdown.
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    root.addEventListener(type, () => sound.unlock());
  }

  let screen: Screen = 'start';
  let held: HeldButtons = NOTHING_HELD;
  let pending: PendingPresses = NO_PRESSES;
  let state: GameState = createInitialState(EMBER_DUELIST);
  let feedback: FeedbackState = NO_FEEDBACK;
  let leftoverMs = 0;
  let freezeLeft = 0;
  // True from the start of a hit-stop until the next real update: the picture stays on the newest state.
  let hitStopView = false;
  // False until the first usable read of a pad, so buttons already held then do not count as presses.
  let padSeen = false;
  let lastTime = performance.now();
  let paused = false;
  // How long the top button has been held during a fight (leaving needs GAME.exitHoldMs).
  let exitHoldMs = 0;
  let stopTest: (() => void) | null = null;
  let statusLine = el('p', 'status');
  let fightButton = el('button', 'action', 'Fight the Ember Duelist');

  function setBanner(text: string | null): void {
    banner.hidden = text === null;
    if (text !== null) banner.textContent = text;
  }

  function showStart(): void {
    screen = 'start';
    exitHoldMs = 0;
    leaveHint.hidden = true;
    canvas.hidden = true;
    panel.hidden = false;
    setBanner(null);
    statusLine = el('p', 'status');
    fightButton = el('button', 'action', 'Fight the Ember Duelist (bottom button)');
    fightButton.type = 'button';
    fightButton.disabled = true;
    fightButton.addEventListener('click', startFight);
    const testButton = el('button', 'action', 'Controller test (top button)');
    testButton.type = 'button';
    testButton.addEventListener('click', showTest);
    panel.replaceChildren(
      el('h1', undefined, 'Boss Trainer'),
      el('p', 'hint', 'During a fight, hold the top button for a second to return to this screen.'),
      fightButton,
      testButton,
      statusLine,
    );
  }

  function showTest(): void {
    screen = 'test';
    exitHoldMs = 0;
    leaveHint.hidden = true;
    canvas.hidden = true;
    panel.hidden = false;
    setBanner(null);
    stopTest = mountControllerScreen(panel, () => {
      stopTest?.();
      stopTest = null;
      showStart();
    });
  }

  function startFight(): void {
    screen = 'fight';
    exitHoldMs = 0;
    leaveHint.hidden = true;
    state = createInitialState(EMBER_DUELIST, newSeed());
    feedback = NO_FEEDBACK;
    leftoverMs = 0;
    freezeLeft = 0;
    hitStopView = false;
    pending = NO_PRESSES;
    paused = false;
    lastTime = performance.now();
    panel.hidden = true;
    canvas.hidden = false;
    setBanner(null);
    sound.unlock();
  }

  banner.addEventListener('click', () => {
    if (screen === 'fight' && paused) showStart();
  });

  function draw(alpha: number): void {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    drawFrame(context, width, height, state, EMBER_DUELIST, alpha, feedback);
  }

  function runFight(now: number, selection: ProfileSelection | null, input: InputFrame): void {
    if (selection?.kind !== 'profile') {
      paused = true;
      exitHoldMs = 0;
      leaveHint.hidden = true;
      setBanner('No usable controller. Reconnect it and press a button (or tap here to go back).');
      lastTime = now;
      draw(0);
      return;
    }
    const hold = advanceHold(exitHoldMs, held.alt, now - lastTime, GAME.exitHoldMs);
    exitHoldMs = hold.heldMs;
    leaveHint.hidden = exitHoldMs === 0;
    if (hold.done) {
      showStart();
      return;
    }
    if (paused) {
      if (input.confirm || input.attackPressed || input.dashPressed) {
        paused = false;
        setBanner(null);
        pending = NO_PRESSES;
      }
      lastTime = now;
      draw(0);
      return;
    }

    pending = addPresses(pending, input);
    const plan = planUpdates(leftoverMs, now - lastTime);
    leftoverMs = plan.leftoverMs;
    lastTime = now;

    for (let i = 0; i < plan.updates; i++) {
      feedback = advanceFeedback(feedback);
      if (freezeLeft > 0) {
        freezeLeft -= 1;
        continue;
      }
      hitStopView = false;
      state = step(state, applyPresses(input, pending), EMBER_DUELIST);
      pending = NO_PRESSES;
      feedback = applyEvents(feedback, state.events);
      freezeLeft = Math.max(freezeLeft, freezeFor(state.events));
      if (freezeLeft > 0) hitStopView = true;
      sound.play(state.events);
    }
    // During a hit-stop nothing moves, so blend at 1 instead of the sweeping leftover (that would make the player judder).
    draw(hitStopView ? 1 : plan.alpha);
  }

  function frame(now: number): void {
    requestAnimationFrame(frame);
    // Sample the pad on every frame, on the controller test screen too, so `held` never goes stale.
    const pad = firstPad();
    const selection = pad === null ? null : selectProfile(pad.id, pad.mapping);
    let input = NO_INPUT;
    if (pad !== null && selection?.kind === 'profile') {
      const sampled = sampleInput(pad, selection.profile, held, GAME.deadZone);
      held = sampled.held;
      // The first read after a pad (re)appears only seeds `held`: what is already down is not a new press.
      if (padSeen) input = sampled.input;
      padSeen = true;
    } else {
      held = NOTHING_HELD;
      padSeen = false;
    }

    if (screen === 'test') {
      lastTime = now;
      return;
    }

    if (screen === 'start') {
      statusLine.textContent = describeController(pad, selection);
      fightButton.disabled = selection?.kind !== 'profile';
      if (selection?.kind === 'profile') {
        if (input.confirm) startFight();
        else if (input.alt) showTest();
      }
      lastTime = now;
      return;
    }
    runFight(now, selection, input);
  }

  showStart();
  requestAnimationFrame(frame);
}
