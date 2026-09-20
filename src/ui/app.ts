import { bossById } from '../bosses';
import type { BossDef } from '../bosses/schema';
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
import { applyDials } from '../game/difficulty';
import { GAME } from '../game/params';
import { step } from '../game/step';
import { createInitialState, type GameState } from '../game/state';
import type { FightSummary } from '../game/summary';
import { createSound } from './audio';
import { mountControllerScreen } from './controller-screen';
import { el } from './dom';
import { NO_FEEDBACK, advanceFeedback, applyEvents, freezeFor, type FeedbackState } from './feedback';
import { advanceFlow, leaveSummary, startFlow, type FightFlow } from './fight-flow';
import { createMenu, menuRows, menuStep, type MenuAction, type MenuModel } from './menu-model';
import { NAV_START, advanceNav, type NavState } from './nav';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { drawFrame } from './render';
import { renderList, renderSummary } from './screens';
import { loadSettings, saveSettings, type Settings } from './settings';
import {
  createSettingsModel,
  settingsRows,
  settingsStep,
  type SettingsModel,
} from './settings-model';
import { browserStorage } from './storage';
import { summaryLines } from './summary-text';
import { createTweak, tweakRows, tweakStep, type TweakModel } from './tweak-model';

type Screen = 'menu' | 'tweak' | 'settings' | 'summary' | 'fight' | 'test';

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
  const storage = browserStorage();
  let prefs: Prefs = loadPrefs(storage);
  let settings: Settings = loadSettings(storage);

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
  sound.setEnabled(settings.sound);
  // A phone only counts some events as a tap for sound: touch needs pointerup or click, not just pointerdown.
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    root.addEventListener(type, () => sound.unlock());
  }

  let screen: Screen = 'menu';
  let menu: MenuModel = createMenu(prefs);
  let tweak: TweakModel = createTweak(prefs);
  let settingsModel: SettingsModel = createSettingsModel(settings);
  let nav: NavState = NAV_START;
  let held: HeldButtons = NOTHING_HELD;
  let pending: PendingPresses = NO_PRESSES;
  // The boss as adjusted by the dials for the current fight.
  let boss: BossDef = bossById(prefs.bossId);
  let state: GameState = createInitialState(boss);
  // The summary tracker and, once the fight ends (win or loss), its result: the summary shows when the end pause is over.
  let flow: FightFlow = startFlow();
  let feedback: FeedbackState = NO_FEEDBACK;
  let leftoverMs = 0;
  let freezeLeft = 0;
  // True from the start of a hit-stop until the next real update: the picture stays on the newest state.
  let hitStopView = false;
  // False until the first usable read of a pad, so buttons already held then do not count as presses.
  let padSeen = false;
  // Whether the controller found on the last frame has a usable button profile.
  let hasProfile = false;
  // A message that replaces the controller line on the menu until the controller is usable or the menu is reopened.
  let notice: string | null = null;
  let lastTime = performance.now();
  let paused = false;
  // How long the top button has been held during a fight (leaving needs GAME.exitHoldMs).
  let exitHoldMs = 0;
  let stopTest: (() => void) | null = null;
  // The summary ignores controller presses for a moment, so a player still mashing a button in the fight does not skip it by accident.
  const SUMMARY_LOCK_MS = 600;
  let summaryUnlockAt = 0;
  const statusLine = el('p', 'status');

  function setBanner(text: string | null): void {
    banner.hidden = text === null;
    if (text !== null) banner.textContent = text;
  }

  /** Hides the fight and its overlays; the next screen fills the panel. */
  function leaveFightScreen(): void {
    exitHoldMs = 0;
    leaveHint.hidden = true;
    canvas.hidden = true;
    panel.hidden = false;
    setBanner(null);
  }

  function updatePrefs(next: Prefs): void {
    if (next === prefs) return;
    prefs = next;
    savePrefs(storage, prefs);
  }

  function updateSettings(next: Settings): void {
    if (next === settings) return;
    settings = next;
    saveSettings(storage, settings);
    sound.setEnabled(settings.sound);
  }

  // Menu
  function renderMenu(): void {
    renderList(
      panel,
      'Boss Trainer',
      'Up and down to move, bottom button to choose, top button to go back. During a fight, hold the top button for a second to leave.',
      menuRows(menu).map((row) => ({ label: row.label, value: row.value })),
      menu.focus,
      (index) => {
        menu = { ...menu, focus: index };
        handleMenu('confirm');
      },
      [statusLine],
    );
  }

  function showMenu(): void {
    screen = 'menu';
    nav = NAV_START;
    notice = null;
    leaveFightScreen();
    menu = createMenu(prefs);
    renderMenu();
  }

  function handleMenu(action: MenuAction): void {
    const result = menuStep(menu, action);
    menu = result.model;
    updatePrefs(menu.prefs);
    if (result.outcome.kind === 'fight') {
      if (hasProfile) {
        startFight();
      } else {
        notice = 'Connect a controller and press a button first.';
        statusLine.textContent = notice;
        renderMenu();
      }
    } else if (result.outcome.kind === 'open') {
      if (result.outcome.screen === 'tweak') showTweak();
      else if (result.outcome.screen === 'settings') showSettings();
      else showTest();
    } else {
      renderMenu();
    }
  }

  // Tweak
  function renderTweak(): void {
    renderList(
      panel,
      'Tweak difficulty',
      'Left and right change a value, up and down move, top button goes back.',
      tweakRows(tweak).map((row) => ({ label: row.label, value: row.value, help: row.help })),
      tweak.focus,
      (index) => {
        tweak = { ...tweak, focus: index };
        handleTweak('confirm');
      },
    );
  }

  function showTweak(): void {
    screen = 'tweak';
    tweak = createTweak(prefs);
    renderTweak();
  }

  function handleTweak(action: MenuAction): void {
    const result = tweakStep(tweak, action);
    tweak = result.model;
    updatePrefs(tweak.prefs);
    if (result.outcome === 'back') showMenu();
    else renderTweak();
  }

  // Settings
  function renderSettings(): void {
    renderList(
      panel,
      'Settings',
      'Left, right or the bottom button switch a setting, top button goes back.',
      settingsRows(settingsModel).map((row) => ({ label: row.label, value: row.value, help: row.help })),
      settingsModel.focus,
      (index) => {
        settingsModel = { ...settingsModel, focus: index };
        handleSettings('confirm');
      },
    );
  }

  function showSettings(): void {
    screen = 'settings';
    settingsModel = createSettingsModel(settings);
    renderSettings();
  }

  function handleSettings(action: MenuAction): void {
    const result = settingsStep(settingsModel, action);
    settingsModel = result.model;
    updateSettings(settingsModel.settings);
    if (result.outcome === 'back') showMenu();
    else renderSettings();
  }

  // Controller test
  function showTest(): void {
    screen = 'test';
    leaveFightScreen();
    stopTest = mountControllerScreen(panel, () => {
      stopTest?.();
      stopTest = null;
      showMenu();
    });
  }

  // Summary
  function showSummary(summary: FightSummary): void {
    screen = 'summary';
    summaryUnlockAt = performance.now() + SUMMARY_LOCK_MS;
    leaveFightScreen();
    const text = summaryLines(summary);
    renderSummary(panel, text.title, text.lines, showMenu);
  }

  /** Leaves the fight for the summary: how it ended, or "left" if it was still going. */
  function endFight(): void {
    // A fight that never ran has nothing to summarise.
    if (state.tick === 0) showMenu();
    else showSummary(leaveSummary(flow, state, boss));
  }

  function startFight(): void {
    screen = 'fight';
    boss = applyDials(bossById(prefs.bossId), prefs.dials);
    state = createInitialState(boss, newSeed());
    flow = startFlow();
    nav = NAV_START;
    exitHoldMs = 0;
    leaveHint.hidden = true;
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
    if (screen === 'fight' && paused) endFight();
  });

  function draw(alpha: number): void {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    drawFrame(context, width, height, state, boss, alpha, feedback);
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
      endFight();
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
      const before = state;
      state = step(state, applyPresses(input, pending), boss);
      pending = NO_PRESSES;
      // After a win or a loss the game shows its message, then starts a new fight: show the summary instead.
      const advanced = advanceFlow(flow, before, state, boss);
      flow = advanced.flow;
      if (advanced.show !== null) {
        showSummary(advanced.show);
        return;
      }
      feedback = applyEvents(feedback, state.events, settings);
      freezeLeft = Math.max(freezeLeft, freezeFor(state.events, settings));
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
    hasProfile = selection?.kind === 'profile';
    if (hasProfile) notice = null;
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

    if (screen === 'fight') {
      runFight(now, selection, input);
      return;
    }

    // Menu, Tweak, Settings and Summary: one step per press, with repeat while a direction is held.
    if (screen === 'menu') statusLine.textContent = notice ?? describeController(pad, selection);
    const walked = advanceNav(nav, input.moveX, input.moveY, now);
    nav = walked.state;
    const action: MenuAction | null = input.confirm ? 'confirm' : input.alt ? 'back' : walked.action;
    lastTime = now;
    if (action === null) return;
    if (screen === 'menu') handleMenu(action);
    else if (screen === 'tweak') handleTweak(action);
    else if (screen === 'settings') handleSettings(action);
    else if ((action === 'confirm' || action === 'back') && now >= summaryUnlockAt) showMenu();
  }

  showMenu();
  requestAnimationFrame(frame);
}
