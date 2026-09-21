# M5d Design: the looks

Fourth step of M5. Owner decisions (2026-09-21): do the looks **before** the generator; the improvements that matter most are a **layered background**, **impact effects and particles** and **better boss and player shapes** (clearer warnings and a nicer HUD were not chosen). Everything stays inside the locked geometric style (simple shapes, strong colours, glows; no images, no art assets). Details are **DELEGATED**. The owner is the reviewer of the result (nothing here can be checked without looking at a screen), so all colours, sizes and strengths live in one tuning file for quick changes.

## What the player sees
- **Background:** a dark gradient sky, two or three layers of silhouettes (pillars, ridges, spires) drifting slowly at different speeds for depth, a few ambient embers, a floor with a glowing edge and faint tile lines. Each boss has its own **mood** (the Ember Duelist warm orange and ember, the Ashen Hound cold ash-blue; an unknown boss gets a neutral mood). The ledges and the wall get more contrast against the background (still plain shapes with a glowing top edge).
- **Effects:** sparks when the player hits the boss, a bright ring on a counter, red sparks when the player is hit, a dust puff when the player or the boss lands or the player dashes, a glow trail behind a dash, a ring where a pounce lands, a burst when the boss or the player is defeated, a ring on a phase change. A small ring pulse when an attack's warning starts is optional.
- **Figures:** the player becomes a small fighter (head, torso, legs, a cape that trails behind), the Ember Duelist a figure with a head, a body, legs and a weapon arm with a blade, the Ashen Hound a low four-legged beast with a head, a tail and legs. Any other boss gets a generic figure (body and head) so generated bosses always draw. They breathe when idle, bob while walking, and lean into attacks. The boss's arm pose is still the attack warning and the gold and red glows for counterable and must-dodge attacks are unchanged.
- **Settings:** a new **Effects** switch (particles, ambient embers and background drift), default on, on the Settings screen. Off gives a still background and no particles. The Flashes and Screen shake switches keep their meaning.

## Rules
- **Looks never change a fight.** Everything here only reads the game state and events; drawn shapes are cosmetic and the hit boxes (`bossBox`, `playerBox`, hit windows) are unchanged. No change to `src/game/`, recording, replay or stats. The Duelist golden test must stay unchanged.
- **Randomness of the looks** (particle velocities) comes from a tiny generator inside the effects state, never from the simulation's generator.
- **Performance on the phone:** at most 160 particles and 12 rings alive at once; the static background layers are drawn once into off-screen canvases (per mood) and reused every frame; per-frame drawing uses only rectangles, circles and a few polygons.
- **Structure:** new modules under `src/ui/look/`: `tuning.ts` (all numbers and colours), `moods.ts` (mood per boss id), `effects.ts` (pure particle system), `background.ts` (layers and drawing), `figures.ts` (pure figure primitives plus their drawing). `render.ts` and `app.ts` only wire them in. Pure parts are unit tested; canvas drawing is checked by reading, typecheck and build.

## Tests
Settings: the Effects switch (default on, stored value validation, model row, tap and cycling). Effects: each event produces the expected effects at the expected place (sparks at the swing, a ring on a counter, dust on a landing found from consecutive states, trail on a dash), particle and ring caps, ageing and removal, gravity, determinism (same input, same effects), no mutation of the given state, nothing spawns when Effects is off. Background: layer shapes are deterministic and within the world width, a mood for every shipped boss id plus a fallback, the ambient ember positions depend only on the tick. Figures: the primitives of each figure stay inside the boss's (or player's) box plus a small margin, mirror correctly with facing, animate with the tick, and the generic figure works for any boss size. The Duelist golden test unchanged.

## Out of scope
New sounds, menu restyling, sprite art, clearer attack warnings and a new HUD (not chosen by the owner), boss-specific attack effects beyond the list above, and any new mechanic.

## Done when
Tests pass, CI is green and deployed, and the owner has looked at it on the phone and sent the first round of tweaks (expected).
