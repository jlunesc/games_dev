# Sound: richer effects, attack sounds and music

Status: design approved by the owner 2026-09-29, built 2026-09-29 (plan in docs/superpowers/plans/2026-09-29-sound.md), awaiting the owner's listen on the phone. All numbers are first guesses to be tuned on the phone.

## Why

Today the game has ten placeholder beeps (`src/ui/audio.ts`), one per `GameEvent`. Every boss and every attack sounds the same, shots make no sound, and there is no music and no volume control. The owner wants "all the sound" improved.

## Decisions (owner, 2026-09-29)

| Question | Decision | Tag |
|---|---|---|
| Scope | Better fight sounds, attack-specific sounds, and music. **Not** menu or UI sounds. | LOCKED |
| Volume | **One master volume** in Settings. | LOCKED |
| Where do sounds come from? | **All generated in code** (Web Audio). No audio files, nothing extra to download or license. | LOCKED |
| Music | **Layered, follows the fight**: a bass pulse and pad from the start, drums and a lead line join in later phases and when a boss is nearly beaten, a short sting on a win or a loss. One shared style, varied per boss by key, tempo and mode. | LOCKED |
| Music reverses "no music in v1" (`docs/SPEC.md`) | Yes, that line is updated. | LOCKED |
| Separate Music on/off switch | Not asked for; not built. Listed as **OPEN** below. | OPEN |

Everything below that the owner did not decide is DELEGATED.

## Rules this design follows

- Sound only **reads** the game. It never changes how a fight plays (`docs/SPEC.md`, section on the loop). It lives in `src/ui/sound/`, next to the looks in `src/ui/look/`.
- **No game change.** Sound works out what happened by comparing the state before and after each update (the way `spawnEffects` does for the looks), not by adding events to `GameEvent`. So recorded fights replay identically, `GAME_VERSION` and the stats `schemaVersion` do not change.
- No new dependency, no sound files, no CSP change (Web Audio needs none).
- The phone is the limit (memory: phone performance). Cap the number of live voices, build the noise buffer once, schedule music only a short time ahead, no per-frame work that allocates.

## Structure

```
src/ui/sound/
  engine.ts    audio context, master volume, limiter, voice cap, ducking, pan
  voices.ts    the sound recipes: a few oscillators + shared noise, an envelope each
  cues.ts      (before, after, fight) -> list of cues to play  (pure, tested)
  music.ts     the sequencer: schedules notes just ahead on the audio clock
  score.ts     what notes play for a given bar and intensity, per boss  (pure, tested)
  tuning.ts    every volume, pitch, tempo and layer threshold
  index.ts     createSound(): the same small interface app.ts uses today
```

`app.ts` keeps one `Sound` object. Its interface changes from `play(events)` to `update(before, after, fight)` plus `startFight(fight)` and `endFight(result)` for the music. `unlock()` stays (browsers need a tap first). The old `src/ui/audio.ts` is removed once ported.

### engine.ts

- One `AudioContext`, created on the first tap as today.
- Signal path: voices and music each feed their own gain, both feed a **master gain** (the Volume setting), then a **compressor used as a limiter**, then the output. A loud moment (hit + counter + music) cannot clip.
- **Voice cap** (default 16): when full, the oldest quiet voice is dropped for a new one. Music voices are not counted against the cap.
- **Ducking**: the music gain dips (default to 40% for about 250 ms) when a warning cue plays, then recovers. Effects are never ducked.
- **Pan**: a cue may carry a pan from -1 to 1, used only in pair fights (see cues).
- The Volume setting maps Off, Low, Medium, High to master gain 0, 0.35, 0.65, 1.0 (in `tuning.ts`). Off skips creating voices at all.

### voices.ts

Recipes built from an oscillator (or two, slightly detuned), an optional burst of shared noise through a filter, a pitch sweep and an exponential envelope. Each recipe is one function `(engine, options) => void` so it can be tested with a fake context. Recipes: `hit`, `playerHurt`, `counter`, `dash`, `studyHit`, `phaseChange`, `defeat`, `fall` (boss down), `whoosh`, `slam`, `shotLaunch`, `boltPass`, `arcLaunch`, `arcLand`, `eruptionMark`, `eruptionBlast`, `warningGold`, `warningRed`.

Design intent, so the recipes have a target:

| Sound | Character |
|---|---|
| Player hit lands on boss | short, punchy: a low thump plus a noise tick; pitch varies slightly so it does not repeat identically |
| Counter | bright and satisfying: a rising two-note ring on top of the hit |
| Player hurt | low, rough, with a downward sweep; louder than everything else |
| Dash | a quick filtered-noise whoosh |
| Study hit | soft and low, quieter than the real hurt sound (the study hurts nobody), as today |
| Phase change | a rising growl and a low pulse |
| Boss down / player down | a falling tone and a fading noise tail; the music stings cover the rest |

### cues.ts

`cuesFor(before, after, fight): Cue[]` is a pure function. A `Cue` is `{ voice, pitch?, pan?, priority }`. It combines the existing events with what changed in the state:

- **Attack starts** (a boss's `mode` becomes `attack`): the warning. It keeps today's rule, **gold (counterable) is a clear high note, red (must-dodge) is low and rough**, and adds a signature from the attack's shape, looked up in the `AttackDef`:
  - a plain hit window: a wind-up swell whose pitch follows the `pose` (`raised` high, `down` and `crouch` low, `sideways` mid, `back` a low draw-back);
  - a `move` (dash): a rising whoosh;
  - a `leap`: a rising launch tone, then a **slam** on landing (the boss's `lift` returns to 0 while `leapToX` was set);
  - a `dive`: a falling whistle;
  - `shots`: a charge sound, then a launch sound for each new shot.
- **Attack turns active** (`attackTick` reaches `windup`): a short strike sound (whoosh for melee) so the moment the danger becomes real is audible.
- **Shots**: a shot in `after.shots` that was not in `before.shots` gives a launch cue by `kind` (`bolt`, `arc`, `eruption`); an arc that reaches `age = flight` gives a landing cue; an eruption whose `age` reaches `delay` gives the blast cue, and its mark gives a soft "about to erupt" tick when it appears. A bolt passing near the player gives a quiet pass-by sound (pan by side).
- **Pair fights**: cues from boss index 0 pan slightly left and index 1 slightly right (`tuning.ts`, default plus or minus 0.35), so you can hear which one is acting. One-boss fights are centred.
- **Priority**: when more cues than the voice cap arrive in one update, higher priority wins (player hurt, warnings and counters first, ambient pass-by last).

Identical cues in the same update are merged (two hit events do not double the volume).

### music.ts and score.ts

- The sequencer runs on a short timer (about 25 ms) and schedules notes up to about 100 ms ahead using `AudioContext.currentTime`, so the beat stays in time whatever the game loop or a freeze does. Music is not paused by the hit freeze.
- **Layers**, switched on by the state (not by the clock): 
  1. bass pulse and pad, from the start of the fight;
  2. drums (kick and noise hat) from phase 2, or when the boss's HP fraction is at or below 0.5;
  3. lead line (a simple arpeggio-based melody) from the last phase, or at HP fraction 0.25 or below.
  Layers fade in over one bar and are never cut off abruptly.
- **The study** plays only the pad at low volume, with no drums, so its purpose (watching) is not drowned. When the real fight begins the pulse comes in.
- **Per boss**: the boss's `id` picks a `key` (root note), `mode` (major or minor) and `tempo` from a table in `tuning.ts`. The generated boss and unknown ids use a default and a seed-based key so each generated boss sounds a little different. A pair fight uses the first boss's key with the second boss's tempo blended in (default: the average).
- **Stings**: a short victory sting on `bossDefeated` or the last of a pair, a short low sting on `playerDefeated`; the music stops with a quick fade (0.3 s) rather than waiting for a bar boundary (built that way: a win or a loss should not wait up to two seconds for the music to end), and the sting plays over the fade.
- **`score.ts`** is pure: `notesFor(bossId, bar, layers) -> Note[]` with a fixed chord progression per mode, so tests can check which notes play at each layer without audio.
- **Restart and quit**: leaving a fight (quit, retry, summary) stops the music with a short fade; a retry restarts from bar 0.
- Music is a constant CPU cost on the phone: notes are made on the fly a fraction of a second ahead, one layer at a time (the pad is three quiet oscillators, the bass two, plus the drums and the lead), so at most about 27 short-lived sound sources (each with a small volume node) are created per bar with every layer on; no reverb or convolution. (The first design said "at most 4 sounding voices"; it counted layers, not oscillators.)

### Settings

- The `Settings.sound: boolean` field becomes `Settings.volume: 'off' | 'low' | 'medium' | 'high'` (default `'medium'`).
- Reading old saved settings: `sound: false` becomes `'off'`, `sound: true` or missing becomes the default. Unknown values fall back to the default, as the other settings do.
- The Settings screen row is labeled **Volume**; Left/Right (or confirm) steps Off, Low, Medium, High. Its help text: "How loud the sounds and music are."
- `docs/phone-testing.md` says Settings has five switches; it now has four switches and the Volume row.

### Turning it on

- `app.ts` calls `sound.startFight(fight)` when a fight begins (after the countdown if any), `sound.update(before, after, fight)` in the same place it calls `sound.play(state.events)` today (once per simulation update, not while frozen), and `sound.endFight(...)` when the fight ends or is left.
- Everything is skipped when volume is Off.

## Testing

Vitest (no real audio):

- `cues.test.ts`: for hand-built before/after states, the right cue for each attack shape (melee by pose, move, leap with landing slam, dive, bolt, arc landing, eruption mark and blast), the gold and red warnings stay distinct, pair fights pan by boss, identical cues merge, priority order under the cap. Uses the real boss files so a new attack shape that has no sound fails a test.
- `score.test.ts`: the layers per HP fraction and phase, each boss id has a key/mode/tempo, the generated boss gets a seed-based key, notes stay in range and in the chosen key.
- `settings` tests: the old `sound` boolean migrates, the new `volume` round-trips, unknown values fall back; `settings-model` tests: the Volume row cycles through four values and the rows list is updated.
- `voices` and `engine` tests with a **fake AudioContext** that records the graph: a voice connects to the right gain, the voice cap drops the right voice, ducking lowers and restores the music gain, Off creates no nodes, `unlock()` never throws when the context rejects.
- A test that the sound module makes no change to the state it reads (the state before and after is deep-equal after `update`).

Not testable in Vitest: how it sounds. That is the owner's phone test.

## Documentation

- `docs/SPEC.md`: update line 123 (sound and music, tags as above) and the settings mention on line 124.
- `docs/phone-testing.md`: Settings paragraph (Volume row) and a new "Sound (M7)" section with a checklist and questions (is each attack readable by ear, is the music too loud or busy, do the warnings cut through, is anything annoying on repeat, does it stay smooth on the S21, does the pair pan help).
- `docs/backlog.md`: left out on purpose, plus a note that the "Clearer attack warnings" item there is now partly covered by the sound cues.
- `docs/design_history.md`: one entry.

## Build order

Each step ends with tests passing and a playable game.

1. **Engine and settings.** `engine.ts`, the Volume setting with migration and its row, the current ten beeps ported to `voices.ts` with no change in how they sound. `audio.ts` removed.
2. **Richer fight sounds.** New recipes for hit, hurt, counter, dash, study hit, phase change, defeat and fall.
3. **Attack-specific cues.** `cues.ts` reading the state before and after: melee by pose, move, leap, dive, shots, eruptions, pair panning.
4. **Music.** `music.ts`, `score.ts`, layers, ducking, study behavior, stings, and the per-boss table.
5. **Docs and the phone pass.** Checklist and tuning after the owner plays it on the S21.

## Open

- **OPEN**: a separate Music on/off switch (so music can be muted while keeping effects). The owner chose one master volume; with the current design music cannot be turned off alone.
- **OPEN**: whether the music should keep playing on the results summary screen. Default: the music stops with the sting.
- All tuning numbers (volumes, pitches, tempos, ducking depth, layer thresholds) are first guesses.
