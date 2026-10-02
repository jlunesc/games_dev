import { BOSS_CHOICES } from '../bosses';
import { resolveFight } from '../bosses/resolve';
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
import { redoDials, type Dials, type RedoChange } from '../game/difficulty';
import type { FightDef } from '../game/fight';
import { GAME } from '../game/params';
import { step } from '../game/step';
import { createInitialState, type GameState } from '../game/state';
import type { FightResult, FightSummary } from '../game/summary';
import { analyzeRecording, fightOf } from '../stats/analyze';
import { buildDetailsExport, buildExport, downloadFile, loadLastExport, saveLastExport, shareOrDownload } from '../stats/export';
import { fightDetails, harmlessAttacks, type FightDetails } from '../stats/details';
import { rateDodges } from '../stats/dodges';
import { createMeter } from '../stats/meter';
import { buildRecord, type FightMeta, type Recording } from '../stats/record';
import { openIndexedDbStore, type FightStore } from '../stats/store';
import { createSound } from './sound';
import { attackNamer } from './details-text';
import { renderDetails } from './details-view';
import { mountControllerScreen } from './controller-screen';
import { el } from './dom';
import { NO_FEEDBACK, advanceFeedback, applyEvents, flashBossFor, freezeFor, type FeedbackState } from './feedback';
import { advanceFlow, leaveRecording, leaveSummary, startFlow, type FightFlow } from './fight-flow';
import { setUpFight } from './fight-setup';
import { MENU_ITEMS, createMenu, menuRows, menuStep, type MenuAction, type MenuModel } from './menu-model';
import { NAV_START, advanceNav, type NavState } from './nav';
import { loadPrefs, savePrefs, type Prefs } from './prefs';
import { createBackground, type BackgroundCache } from './look/background';
import { NO_EFFECTS, spawnEffects, stepEffects, type EffectsState } from './look/effects';
import { moodFor } from './look/moods';
import { drawFrame } from './render';
import { createMenuScene } from './menu-scene';
import { renderList, renderSummary } from './screens';
import { loadSettings, saveSettings, type Settings } from './settings';
import {
  createSettingsModel,
  settingsRows,
  settingsStep,
  type SettingsModel,
} from './settings-model';
import {
  createStats,
  DEFAULT_EXPORT_AMOUNT,
  describeLastExport,
  fightsToExport,
  statsRows,
  statsStep,
  withCount,
  withExported,
  withNotice,
  type ExportAmount,
  type StatsModel,
} from './stats-model';
import { browserStorage } from './storage';
import { studyBanner } from './study-banner';
import { createSummaryMenu, summaryRows, summaryStep, type SummaryMenu } from './summary-menu';
import { summaryLines } from './summary-text';
import { createTweak, tweakRows, tweakStep, type TweakModel } from './tweak-model';

type Screen = 'menu' | 'tweak' | 'stats' | 'settings' | 'summary' | 'details' | 'fight' | 'test';

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
  // The arena behind the menus: a second canvas under the panel, shown whenever the panel is.
  const sceneCanvas = el('canvas', 'scene-canvas');
  const sceneContext = sceneCanvas.getContext('2d');
  const scene = createMenuScene();
  const panel = el('div', 'panel');
  const banner = el('p', 'banner');
  banner.hidden = true;
  const leaveHint = el('p', 'banner leave', 'Keep holding to leave the fight…');
  leaveHint.hidden = true;
  // The study note sits near the top, small and see-through, so it never covers the action or blocks a tap.
  const studyNote = el('p', 'note');
  studyNote.hidden = true;
  // The pause button (a tap alternative to the pad's pause button) and the pause screen.
  const pauseButton = el('button', 'pause-button', 'II');
  pauseButton.type = 'button';
  pauseButton.setAttribute('aria-label', 'Pause');
  pauseButton.hidden = true;
  const resumeRow = el('button', 'row focused', 'Resume');
  resumeRow.type = 'button';
  const leaveRow = el('button', 'row', 'Leave the fight');
  leaveRow.type = 'button';
  const pauseBox = el('div', 'pause-box');
  pauseBox.hidden = true;
  const pauseCard = el('div', 'pause-card');
  pauseCard.append(
    el('h1', undefined, 'Paused'),
    resumeRow,
    leaveRow,
    el('p', 'hint', "The jump button or the pad's pause button resumes. Hold the top button to leave."),
  );
  pauseBox.append(pauseCard);
  root.replaceChildren(sceneCanvas, canvas, panel, banner, leaveHint, studyNote, pauseButton, pauseBox);

  // The fight store opens once, in the background. It resolves to null when the device cannot store stats (the
  // game plays on) and never rejects. Anything that needs the store awaits this.
  const storeReady: Promise<FightStore | null> = openIndexedDbStore();

  const sound = createSound();
  sound.setVolume(settings.volume);
  // A phone only counts some events as a tap for sound: touch needs pointerup or click, not just pointerdown.
  for (const type of ['pointerdown', 'pointerup', 'click']) {
    root.addEventListener(type, () => sound.unlock());
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) sound.suspend();
    else sound.unlock();
  });

  let screen: Screen = 'menu';
  let menu: MenuModel = createMenu(prefs);
  let tweak: TweakModel = createTweak(prefs);
  let settingsModel: SettingsModel = createSettingsModel(settings);
  let statsModel: StatsModel = createStats(null, null);
  // Bumped each time the Stats screen opens, so a slow read, export or delete from an earlier visit is ignored.
  let statsSession = 0;
  // True while an export or delete is running: further presses (except back) wait.
  let statsBusy = false;
  // The extra last line on the summary: whether the fight just played was saved. Null while unknown.
  let saveLine: string | null = null;
  // The fight details (plots and the recommendation) of the fight just played: null until its analysis is done, and for a fight left during the study.
  let shownDetails: FightDetails | null = null;
  // The attack names of that fight, for the details screen.
  let detailsNames: (attackId: string) => string = (id) => id;
  // How that fight was set up and ended, for the details export.
  let detailsInfo: { meta: FightMeta; result: FightResult } | null = null;
  // The line on the summary saying whether the details file was saved; null until one is downloaded.
  let downloadLine: string | null = null;
  // Bumped when a new fight starts, so a save still running from an earlier fight does not write its line into the new one.
  let saveEpoch = 0;
  // What the summary screen currently shows, kept so the save line can be added when the save finishes.
  let shownSummary: FightSummary | null = null;
  // The dials of the fight being played or just played. A redo changes these, not the menu's own settings.
  let fightDials: Dials = prefs.dials;
  // The after-fight menu, and the change a Redo would make (picked when the summary opens, so the row can say it).
  let summaryMenu: SummaryMenu = createSummaryMenu('left', null, false);
  let redoPlan: { dials: Dials; change: RedoChange | null } = { dials: prefs.dials, change: null };
  let nav: NavState = NAV_START;
  let held: HeldButtons = NOTHING_HELD;
  let pending: PendingPresses = NO_PRESSES;
  // The bosses of the current fight, as adjusted by the dials (one boss, or a pair).
  let fight: FightDef = resolveFight(prefs.bossId, 1).fight;
  // True when the fight is a generated boss that couldn't be verified as fair (shown as a banner).
  let bossUnfair = false;
  let state: GameState = createInitialState(fight);
  // The summary tracker and, once the fight ends (win or loss), its result: the summary shows when the end pause is over.
  // This first flow is only a placeholder (seed 1 is the default of createInitialState); startFight makes the real one.
  let flow: FightFlow = startFlow({
    bossId: fight.bosses[0]!.id,
    presetId: prefs.presetId,
    dials: prefs.dials,
    seed: 1,
    study: 0, // placeholder: never played, startFight makes the real one
    playedAt: new Date().toISOString(),
  });
  let feedback: FeedbackState = NO_FEEDBACK;
  // Which boss flashes white after a hit (0 is the primary; only a pair has another).
  let flashBoss = 0;
  // The looks: particles and the pre-drawn background. Cosmetic only, never read by the simulation.
  let fx: EffectsState = NO_EFFECTS;
  let background: BackgroundCache | null = null;
  // One BackgroundCache per mood, built the first time that mood is needed and reused after (there are only a
  // few moods, so this caps memory rather than growing it, and retrying the same boss costs no re-render).
  const backgroundCache = new Map<string, BackgroundCache | null>();
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
  // True while the player has paused the fight on purpose (the pause screen is up). Separate from `paused`, which is the missing-controller pause.
  let manualPause = false;
  // How long the top button has been held during a fight (leaving needs GAME.exitHoldMs).
  let exitHoldMs = 0;
  let stopTest: (() => void) | null = null;
  // The summary ignores controller presses for a moment, so a player still mashing a button in the fight does not skip it by accident.
  const SUMMARY_LOCK_MS = 600;
  let summaryUnlockAt = 0;
  const statusLine = el('p', 'status');

  // The last banner text shown (null: hidden). runFight sets the banner every frame, so skip the DOM when nothing changed.
  let bannerText: string | null = null;
  function setBanner(text: string | null): void {
    if (text === bannerText) return;
    bannerText = text;
    banner.hidden = text === null;
    if (text !== null) banner.textContent = text;
  }

  // The last study note shown (null: hidden). Same idea as setBanner: skip the DOM when nothing changed.
  let studyNoteText: string | null = null;
  function setStudyNote(text: string | null): void {
    if (text === studyNoteText) return;
    studyNoteText = text;
    studyNote.hidden = text === null;
    if (text !== null) studyNote.textContent = text;
  }

  /** Hides the fight and its overlays; the next screen fills the panel. */
  function leaveFightScreen(): void {
    sound.endFight();
    exitHoldMs = 0;
    leaveHint.hidden = true;
    manualPause = false;
    pauseBox.hidden = true;
    pauseButton.hidden = true;
    canvas.hidden = true;
    panel.hidden = false;
    sceneCanvas.hidden = false;
    setBanner(null);
    setStudyNote(null);
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
    sound.setVolume(settings.volume);
  }

  // Menu
  function renderMenu(): void {
    renderList(
      panel,
      'Boss Trainer',
      'Up and down to move, bottom button to choose, top button to go back. During a fight, hold the top button for a second to leave.',
      menuRows(menu).map((row) => ({
        label: row.label,
        value: row.value,
        note: row.note,
        dropdown:
          row.id === 'boss' && menu.bossDropdown !== null
            ? {
                options: BOSS_CHOICES.map((choice) => choice.name),
                focus: menu.bossDropdown,
                onPick: (optionIndex: number) => {
                  menu = { ...menu, bossDropdown: optionIndex };
                  handleMenu('confirm');
                },
              }
            : undefined,
      })),
      menu.focus,
      (index) => {
        // A tap on any row while the dropdown is open closes it; a tap on the Boss row itself only closes it.
        const wasOpen = menu.bossDropdown !== null;
        menu = { ...menu, focus: index, bossDropdown: null };
        if (wasOpen && MENU_ITEMS[index] === 'boss') renderMenu();
        else handleMenu('confirm');
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
      else if (result.outcome.screen === 'stats') showStats();
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

  // Stats
  let statsAmount: ExportAmount = DEFAULT_EXPORT_AMOUNT;
  function renderStats(): void {
    const footer = [
      el('p', 'hint', describeLastExport(statsModel.lastExportAt)),
      el('p', 'hint', 'Android can clear browser data, so export now and then.'),
    ];
    if (statsModel.notice !== null) footer.push(el('p', 'hint', statsModel.notice));
    renderList(
      panel,
      'Stats',
      "Up and down move, bottom button chooses, top button goes back. Tap Export with a finger to use the phone's share sheet. Fights to export sets how many of your newest fights the file holds.",
      statsRows(statsModel).map((row) => ({ label: row.label, value: row.value, help: row.help })),
      statsModel.focus,
      (index) => {
        if (statsBusy) return;
        statsModel = { ...statsModel, focus: index };
        handleStats('confirm');
      },
      footer,
    );
  }

  function showStats(): void {
    screen = 'stats';
    statsBusy = false;
    const session = ++statsSession;
    statsModel = createStats(null, loadLastExport(storage), statsAmount);
    renderStats();
    void loadStatsCount(session);
  }

  /** Reads how many fights are saved and shows it. A failed read shows "unavailable". */
  async function loadStatsCount(session: number): Promise<void> {
    let count: number | null = null;
    try {
      const store = await storeReady;
      count = store === null ? null : await store.count();
    } catch {
      count = null;
    }
    if (session !== statsSession || screen !== 'stats') return;
    statsModel = withCount(statsModel, count);
    renderStats();
  }

  function handleStats(action: MenuAction): void {
    if (statsBusy && action !== 'back') return;
    const result = statsStep(statsModel, action);
    statsModel = result.model;
    if (result.outcome === 'back') {
      showMenu();
      return;
    }
    renderStats();
    statsAmount = statsModel.amount;
    if (result.outcome === 'export') void runExport(statsSession);
    else if (result.outcome === 'delete') void runDelete(statsSession);
  }

  /** Runs an export or delete as the current visit to the Stats screen, and ignores it if the player has since left or reopened it. */
  async function runStatsTask(session: number, task: () => Promise<(model: StatsModel) => StatsModel>): Promise<void> {
    statsBusy = true;
    statsModel = withNotice(statsModel, 'Working…');
    renderStats();
    let change: (model: StatsModel) => StatsModel;
    try {
      change = await task();
    } catch {
      change = (model) => withNotice(model, 'That did not work.');
    }
    if (session !== statsSession) return;
    statsBusy = false;
    if (screen !== 'stats') return;
    statsModel = change(statsModel);
    renderStats();
  }

  function runExport(session: number): Promise<void> {
    return runStatsTask(session, async () => {
      const store = await storeReady;
      if (store === null) return (model) => withNotice(model, 'This device cannot store stats.');
      const saved = await store.all();
      const fights = saved.slice(saved.length - fightsToExport(saved.length, statsModel.amount));
      const result = await shareOrDownload(buildExport(fights, new Date()));
      if (result === 'shared' || result === 'downloaded') {
        const iso = new Date().toISOString();
        saveLastExport(storage, iso);
        const message = result === 'shared' ? 'Sent.' : 'File saved to your downloads.';
        return (model) => withNotice(withExported(model, iso), message);
      }
      const message = result === 'cancelled' ? 'Export cancelled.' : 'Export failed.';
      return (model) => withNotice(model, message);
    });
  }

  function runDelete(session: number): Promise<void> {
    return runStatsTask(session, async () => {
      const store = await storeReady;
      if (store === null) return (model) => withNotice(model, 'This device cannot store stats.');
      await store.clear();
      return (model) => withNotice(withCount(model, 0), 'All fights deleted.');
    });
  }

  // Settings
  function renderSettings(): void {
    renderList(
      panel,
      'Settings',
      'Left, right or the bottom button change a setting, top button goes back.',
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
  function renderSummaryScreen(): void {
    if (shownSummary === null) return;
    const text = summaryLines(shownSummary);
    const rows = summaryRows(summaryMenu, redoPlan.change);
    renderSummary(
      panel,
      text.title,
      [...text.lines, ...(saveLine === null ? [] : [saveLine]), ...(downloadLine === null ? [] : [downloadLine])],
      rows,
      summaryMenu.focus,
      (index) => {
        summaryMenu = { ...summaryMenu, focus: index };
        handleSummary('confirm');
      },
    );
  }

  function handleSummary(action: MenuAction): void {
    const result = summaryStep(summaryMenu, action);
    summaryMenu = result.menu;
    if (result.pick === 'details') showDetails();
    else if (result.pick === 'download') downloadDetails();
    else if (result.pick === 'redo') startFight(redoPlan.dials);
    else if (result.pick === 'again') startFight(fightDials);
    else if (result.pick === 'menu') showMenu();
    else renderSummaryScreen();
  }

  function showDetails(): void {
    if (shownDetails === null) return;
    screen = 'details';
    renderDetails(panel, shownDetails, detailsNames, backFromDetails);
    window.scrollTo(0, 0);
  }

  function downloadDetails(): void {
    if (shownDetails === null || detailsInfo === null) return;
    try {
      const file = buildDetailsExport(detailsInfo.meta, detailsInfo.result, shownDetails, detailsNames, new Date());
      downloadLine = downloadFile(file) === 'downloaded' ? `Fight details saved to your downloads (${file.name}).` : 'The fight details could not be saved.';
    } catch {
      downloadLine = 'The fight details could not be saved.';
    }
    renderSummaryScreen();
  }

  function backFromDetails(): void {
    screen = 'summary';
    renderSummaryScreen();
  }

  function handleDetails(action: MenuAction): void {
    if (action === 'confirm' || action === 'back') backFromDetails();
    else if (action === 'up') window.scrollBy(0, -140);
    else if (action === 'down') window.scrollBy(0, 140);
  }

  function showSummary(summary: FightSummary): void {
    screen = 'summary';
    shownSummary = summary;
    redoPlan = redoDials(fightDials, summary.result === 'victory', newSeed());
    summaryMenu = createSummaryMenu(summary.result, redoPlan.change, shownDetails !== null);
    summaryUnlockAt = performance.now() + SUMMARY_LOCK_MS;
    leaveFightScreen();
    renderSummaryScreen();
  }

  /**
   * Saves one fight on this device and sets the summary's save line. Never throws: any failure becomes a line
   * on screen and the game carries on.
   */
  async function saveFight(recording: Recording, result: FightResult): Promise<void> {
    const epoch = saveEpoch;
    // Taken now: a new fight may start while the save below is waiting.
    const nameOf = attackNamer(fight);
    let line: string;
    let details: FightDetails | null = null;
    try {
      const target = await storeReady;
      // Let the browser paint the summary or the end pause before the replay below runs (it can take a moment
      // on a long fight and would otherwise freeze the screen on the last fight frame).
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      const meter = createMeter();
      const analysis = analyzeRecording(recording, meter.observe);
      // A fight left during the study has no fight time: no details at all.
      if (analysis.fightSeconds > 0) {
        try {
          const measures = meter.result();
          const played = fightOf(recording.meta);
          details = fightDetails(analysis, measures, rateDodges(played, analysis, measures), harmlessAttacks(played));
        } catch {
          details = null; // a fault in the details must never stop the fight being saved
        }
      }
      if (target === null) {
        line = 'This fight was not saved: this device cannot store stats.';
      } else {
        const saved = await target.count();
        await target.add(buildRecord(recording, result, saved + 1, analysis));
        line = `Fight saved (${saved + 1} on this device).`;
      }
    } catch {
      line = 'This fight could not be saved.';
    }
    // A new fight has started since: its summary must not show this line.
    if (epoch !== saveEpoch) return;
    saveLine = line;
    shownDetails = details;
    detailsNames = nameOf;
    detailsInfo = { meta: recording.meta, result };
    if (screen === 'summary') {
      // The menu gains its Fight details row now that the analysis is done.
      const focused = summaryMenu.items[summaryMenu.focus];
      const rebuilt = createSummaryMenu(shownSummary?.result ?? 'left', redoPlan.change, details !== null);
      summaryMenu = { ...rebuilt, focus: Math.max(0, rebuilt.items.indexOf(focused ?? 'again')) };
      renderSummaryScreen();
    }
  }

  /** Leaves the fight for the summary: how it ended, or "left" if it was still going. */
  function endFight(): void {
    // A fight that never ran has nothing to summarise and is not saved.
    if (state.tick === 0) {
      showMenu();
      return;
    }
    // A fight that already ended was saved when it ended; only a fight still going is saved here.
    const leaving = leaveRecording(flow);
    if (leaving !== null) {
      saveLine = null;
      downloadLine = null;
      shownDetails = null;
      void saveFight(leaving.recording, 'left');
    }
    showSummary(leaveSummary(flow, state, fight));
  }

  function startFight(dials: Dials = prefs.dials): void {
    screen = 'fight';
    fightDials = dials;
    saveEpoch += 1;
    saveLine = null;
    downloadLine = null;
    shownDetails = null;
    shownSummary = null;
    const seed = newSeed();
    const setup = setUpFight(prefs.bossId, seed, dials, prefs.study);
    fight = setup.fight;
    bossUnfair = setup.unfair;
    state = createInitialState(fight, seed, setup.study);
    flow = startFlow({
      bossId: setup.recordBossId,
      presetId: prefs.presetId,
      dials,
      seed,
      study: setup.study,
      playedAt: new Date().toISOString(),
    });
    nav = NAV_START;
    exitHoldMs = 0;
    leaveHint.hidden = true;
    feedback = NO_FEEDBACK;
    flashBoss = 0;
    fx = NO_EFFECTS;
    // Built once per mood and reused after (null when no canvas can be made: the plain gradient is drawn instead).
    const mood = moodFor(fight.bosses[0]!.id, seed);
    let cached = backgroundCache.get(mood.id);
    if (cached === undefined) {
      // A generated fight's backdrop is used once: drop the last one so the cache does not grow with every fight.
      for (const id of backgroundCache.keys()) if (id.startsWith('generated-')) backgroundCache.delete(id);
      cached = createBackground(mood);
      backgroundCache.set(mood.id, cached);
    }
    background = cached;
    leftoverMs = 0;
    freezeLeft = 0;
    hitStopView = false;
    pending = NO_PRESSES;
    paused = false;
    manualPause = false;
    pauseBox.hidden = true;
    pauseButton.hidden = false;
    lastTime = performance.now();
    panel.hidden = true;
    sceneCanvas.hidden = true;
    canvas.hidden = false;
    setBanner(null);
    setStudyNote(null);
    sound.unlock();
    sound.startFight(fight, seed);
  }

  banner.addEventListener('click', () => {
    if (screen === 'fight' && paused) endFight();
  });

  /** Stops the fight where it is: no updates run, so nothing is recorded and the clock does not move. */
  function pauseFight(): void {
    if (screen !== 'fight' || paused || manualPause) return;
    manualPause = true;
    exitHoldMs = 0;
    leaveHint.hidden = true;
    pauseBox.style.setProperty('--accent', scene.moodOf(prefs.bossId).accent);
    pauseBox.hidden = false;
    setStudyNote(null);
    sound.suspend();
  }

  function resumeFight(): void {
    if (!manualPause) return;
    manualPause = false;
    pauseBox.hidden = true;
    // Presses made while paused do not carry into the fight.
    pending = NO_PRESSES;
    sound.unlock();
  }

  pauseButton.addEventListener('click', pauseFight);
  resumeRow.addEventListener('click', resumeFight);
  leaveRow.addEventListener('click', () => {
    if (screen === 'fight' && manualPause) endFight();
  });

  function draw(alpha: number): void {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(canvas.clientWidth * ratio);
    const height = Math.round(canvas.clientHeight * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    drawFrame(context, width, height, state, fight, alpha, feedback, {
      effects: fx,
      background,
      motion: settings.effects,
      flashBoss,
    });
  }

  function runFight(now: number, selection: ProfileSelection | null, input: InputFrame, pausePressed: boolean): void {
    if (selection?.kind !== 'profile') {
      // Losing the pad pauses the fight anyway, with its own message.
      manualPause = false;
      pauseBox.hidden = true;
      paused = true;
      exitHoldMs = 0;
      leaveHint.hidden = true;
      setBanner('No usable controller. Reconnect it and press a button (or tap here to go back).');
      setStudyNote(null);
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
    if (manualPause) {
      if (input.confirm || pausePressed) resumeFight();
      setStudyNote(null);
      lastTime = now;
      draw(0);
      return;
    }
    if (pausePressed && !paused) {
      pauseFight();
      lastTime = now;
      draw(0);
      return;
    }
    if (paused) {
      if (input.confirm || input.attackPressed || input.dashPressed) {
        paused = false;
        setBanner(null);
        pending = NO_PRESSES;
      }
      // No study note under the pause banner; the next running update brings it back.
      setStudyNote(null);
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
      fx = stepEffects(fx);
      if (freezeLeft > 0) {
        freezeLeft -= 1;
        continue;
      }
      hitStopView = false;
      const before = state;
      const frameInput = applyPresses(input, pending);
      state = step(state, frameInput, fight);
      pending = NO_PRESSES;
      // After a win or a loss the game shows its message, then starts a new fight: show the summary instead.
      const advanced = advanceFlow(flow, before, state, fight, frameInput);
      flow = advanced.flow;
      if (advanced.finished !== null) {
        saveLine = null;
        downloadLine = null;
        shownDetails = null;
        void saveFight(advanced.finished.recording, advanced.finished.result);
      }
      if (advanced.show !== null) {
        showSummary(advanced.show);
        return;
      }
      feedback = applyEvents(feedback, state.events, settings);
      flashBoss = flashBossFor(state.events, before, state, flashBoss);
      fx = spawnEffects(fx, before, state, fight, settings.effects);
      freezeLeft = Math.max(freezeLeft, freezeFor(state.events, settings));
      if (freezeLeft > 0) hitStopView = true;
      sound.update(before, state, fight);
    }
    // The study note is separate from the bottom banner (which the paused-controller message uses).
    setStudyNote(studyBanner(state.study, state.tick, bossUnfair));
    // During a hit-stop nothing moves, so blend at 1 instead of the sweeping leftover (that would make the player judder).
    draw(hitStopView ? 1 : plan.alpha);
  }

  let sceneFrames = 0;
  let sceneKey = '';
  /** Draws the arena behind the menus at half the frame rate; a still picture (Effects off) is drawn only when something changed. */
  function drawScene(): void {
    if (screen === 'fight' || sceneContext === null) return;
    sceneFrames++;
    const motion = settings.effects;
    if (motion && sceneFrames % 2 === 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(sceneCanvas.clientWidth * ratio);
    const height = Math.round(sceneCanvas.clientHeight * ratio);
    const key = `${prefs.bossId}|${width}x${height}|${motion}`;
    if (!motion && key === sceneKey) return;
    sceneKey = key;
    if (sceneCanvas.width !== width || sceneCanvas.height !== height) {
      sceneCanvas.width = width;
      sceneCanvas.height = height;
    }
    scene.draw(sceneContext, width, height, prefs.bossId, sceneFrames, motion);
    panel.style.setProperty('--accent', scene.moodOf(prefs.bossId).accent);
  }

  function frame(now: number): void {
    requestAnimationFrame(frame);
    drawScene();
    // Sample the pad on every frame, on the controller test screen too, so `held` never goes stale.
    const pad = firstPad();
    const selection = pad === null ? null : selectProfile(pad.id, pad.mapping);
    hasProfile = selection?.kind === 'profile';
    if (hasProfile) notice = null;
    let input = NO_INPUT;
    let pausePressed = false;
    if (pad !== null && selection?.kind === 'profile') {
      const sampled = sampleInput(pad, selection.profile, held, GAME.deadZone);
      held = sampled.held;
      // The first read after a pad (re)appears only seeds `held`: what is already down is not a new press.
      if (padSeen) {
        input = sampled.input;
        pausePressed = sampled.pausePressed;
      }
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
      runFight(now, selection, input, pausePressed);
      return;
    }

    // Menu, Tweak, Stats, Settings and Summary: one step per press, with repeat while a direction is held.
    if (screen === 'menu') statusLine.textContent = notice ?? describeController(pad, selection);
    const walked = advanceNav(nav, input.moveX, input.moveY, now);
    nav = walked.state;
    const action: MenuAction | null = input.confirm ? 'confirm' : input.alt ? 'back' : walked.action;
    lastTime = now;
    if (action === null) return;
    if (screen === 'menu') handleMenu(action);
    else if (screen === 'tweak') handleTweak(action);
    else if (screen === 'stats') handleStats(action);
    else if (screen === 'settings') handleSettings(action);
    else if (screen === 'details') handleDetails(action);
    else if (now >= summaryUnlockAt) handleSummary(action);
  }

  showMenu();
  requestAnimationFrame(frame);
}
