# Testing on the phone (Galaxy S21)

A PWA can only be installed over HTTPS, so test the phone from the deployed GitHub Pages site, not from the PC over wifi.

## One-time setup
1. Create the GitHub repository and push `main`. Turn on two-factor authentication on the account (SPEC section 4, rule 5).
2. In the repository: Settings, Pages, Source: **GitHub Actions**. The `CI` workflow deploys on every push to `main`.
3. Open the Pages URL (shown in the workflow run) in Chrome on the S21.

## Install and offline check
- [ ] Chrome menu, "Install app" (or "Add to Home screen"). The icon is a gold diamond on dark.
- [ ] Launch it from the home screen: it opens without the browser bar.
- [ ] Turn on airplane mode, close the app fully, launch it again: it still opens.
- [ ] After a new deploy, launch the app twice. The first launch still shows the old version while the update downloads in the background. The new version appears on the second launch.

## Controller check (repeat for every controller mode)
Pair the 8BitDo in Android Bluetooth settings. Check the controller's manual for how to switch modes; each mode may report buttons differently.
1. Open the app, press any button on the controller so it wakes up, then choose "Controller test" in the menu (move down to it and press the bottom button, or tap it). A "Gamepad" panel appears. Use the Back button at the top to return.
2. Press every button once and move each stick and trigger through its full range.
3. Tap **Copy report** and paste the text into the chat with Claude. Note which 8BitDo mode it was in. Tapping Copy report with a finger is fine: the report remembers every button you pressed ("ever pressed") and each stick's range, so you do not need to hold anything.
4. Repeat for each mode. The button layout decision (SPEC section 5) will use these reports.

If the controller shows nothing, note which mode it was in and whether the page says the Gamepad API is not available (that means the page is not HTTPS).

## On the PC
`npm run dev`, open http://localhost:5173, plug in or pair the PC controller, and follow the controller check above. Reports from different controllers are expected to differ.

## Playing the fight and the menu (M2 and M3a)
### The menu
Open the app with the controller connected. The menu lists these rows: **Fight**, **Boss**, **Difficulty**, **Tweak difficulty**, **Settings** and **Controller test**. The line at the bottom says which controller the phone found; if it says "No controller detected", press any button on the controller so the phone notices it.

How to move: up and down (d-pad or left stick) move the highlight, and it wraps around from the last row to the first. Left and right change the value of the row you are on (Boss, Difficulty). On the Boss row they do nothing for now, because there is only one boss. The bottom button chooses the row, and the top button goes back. During a fight, hold the top button for about a second to leave. You can also tap any row with a finger.

The menu remembers your last choices (boss, difficulty and any tweaks), even after you close the app. It opens with Fight highlighted, so pressing the bottom button once starts the same fight as last time. After a fight the summary comes first, so it takes two presses: one to leave the summary, one for Fight.

**Difficulty** has three presets (a preset is a ready-made set of values): **Easy**, **Normal** and **Hard**. Left and right switch between them. Normal is the fight as designed. Easy gives longer warnings, slower and less frequent attacks, less boss health and fewer kinds of attack. Hard is faster, attacks more often, gives shorter warnings and gives the boss more health, and each attack that hits you costs 2 hits instead of 1. If you change any value in the Tweak screen, the menu shows **Custom (from Normal)**, or from whichever preset you started with.

**Tweak difficulty** lets you change the fight one value at a time (each value has a short explanation under the list). Up and down pick a value, left and right change it, and the top button goes back to the menu. There are seven values:
- **Speed**: how fast the boss moves and how soon it recovers after an attack.
- **Attack frequency**: how often it attacks (higher means shorter pauses).
- **Warning length**: how long you get to read an attack before it lands (lower is harder).
- **Boss health**: how much it takes to beat it.
- **Damage**: how many of your hits each attack costs.
- **Attack range**: how far the attacks reach and how far away the boss starts them.
- **Variety**: how many different attacks it uses (lower means fewer kinds).

The last row, **Reset to preset**, puts every value back to the preset (Easy, Normal or Hard) you started from. It reacts to the bottom button. Choosing a different preset in the Difficulty row also starts again from that preset's values.

**Settings** switches four things on or off: **Hit freeze** (a tiny pause when a hit lands), **Screen shake**, **Flashes** (white and red flashes when something is hit) and **Sound**. They only change how a fight looks and sounds, and the fight rules stay the same. One honest catch: switching Hit freeze off does not change the rules, but you get slightly less time to react after a hit, so timing can feel different. Left, right or the bottom button switch one; the top button goes back.

**The summary.** After every fight (a win, a loss, or leaving with the top button) a summary appears instead of the next fight starting. It shows the result ("Victory!", "Defeated" or "You left the fight"), the time, the phase reached, the hits you took, the boss's health left, and the attack that hurt you most (if nothing hit you, it says "You were never hit."). The bottom button (or tapping "Back to the menu") returns to the menu. For about half a second at the start the controller is ignored, so a button you were still pressing in the fight does not skip the summary by accident.

### The fight
The installed app opens sideways (landscape) by itself. If it does not after an update (Android can take a while to notice a changed app setting), uninstall the app and install it again from the site. In a normal Chrome tab, turn the phone sideways yourself.

Controls: left stick or d-pad to move, bottom button to jump (hold it for a higher jump), left button to attack, right shoulder to dash.

Try each of these and note anything that feels off:
- [ ] Moving with the stick and with the d-pad feels the same and responds at once.
- [ ] A quick tap of jump gives a small hop, holding gives a high jump.
- [ ] Dash: a quick burst, and you cannot dash again for a short moment.
- [ ] The Ember Duelist walks up to you, keeps a fighting distance, and backs off if you crowd it. It turns to face you while it walks; during an attack it keeps facing the way it started, so dashing past it works (it swings at the empty side).
- [ ] Its arm shows which attack is coming: raised (a slam, gold glow), sideways (a low sweep, red glow), pulled back (a lunge across the screen, red glow).
- [ ] Red attacks are dodged: jump over the sweep, dash through the lunge or the sweep. The slam is tall, so jumping does not help; dash through it or back away.
- [ ] Countering: press attack in the last fifth of a second of the gold slam's warning while you are close. The Duelist turns blue and is staggered for about a second and a half, and your hits do double damage. Too early or too late is just a normal swing.
- [ ] Hits feel right: the freeze, the shake and the flash when you hit it and when it hits you; a counter feels bigger.
- [ ] Getting hit: red flash, a short freeze, blinking for about a second. Five hits and you are defeated.
- [ ] Phase 2 at about two thirds of its health: it powers up (white glow, cannot be hurt). After that it attacks more often with less pause, walks faster, and sometimes does two attacks in a row. It always opens phase 2 with the ground burst (arm pointing down, red glow): a low shockwave that travels along the floor away from it. Jump over it.
- [ ] In a two-attack chain, the second attack still shows its full warning (pose and glow), and it can start a little late while the boss walks into range first.
- [ ] Beating it shows "Victory" on the screen for a moment and then the summary; losing shows "Defeated" and then the summary. No new fight starts by itself.
- [ ] Fights are not identical: the order of attacks differs from fight to fight.
- [ ] Sounds play for hits, dashes and the Duelist's warnings. Sound needs one tap on the screen after the app starts. If you started the fight with the controller and there is no sound, tap the screen once (it should then work from the next hit).
- [ ] Turn the controller off in the middle of a fight. The game pauses and says so. Turn it on and press the bottom, left or dash button to continue (holding the top button for about a second, or tapping the "No usable controller" message, leaves the fight and shows the summary).
- [ ] Tapping the top button during a fight does nothing; holding it for about a second shows 'Keep holding to leave the fight…' and then leaves the fight and shows the summary ("You left the fight").
- [ ] Pressing several buttons at once (for example moving while jumping and attacking) works, and fast repeated taps are not lost.

The menu and the summary (M3a):
- [ ] The menu opens with Fight highlighted; up and down move the highlight and it wraps around.
- [ ] Left and right on Difficulty switch between Easy, Normal and Hard. Easy feels clearly easier (longer warnings, slower and less frequent attacks, less boss health) and Hard clearly harder.
- [ ] In Tweak, each value changes with left and right, the menu then shows "Custom (from ...)", "Reset to preset" puts it back, and your choice is still there after closing and reopening the app.
- [ ] In Settings, switching off Hit freeze, Screen shake, Flashes or Sound removes exactly that effect in a fight, and the fight itself plays the same.
- [ ] After a win, a loss, and after leaving with the top button, the summary appears with time, phase reached, hits taken, boss health left, and the attack that hurt you most (or "You were never hit." if nothing hit you); the bottom button returns to the menu.
- [ ] The menu rows show only their names, with no "top button" or "bottom button" text inside them.
- [ ] Tapping Fight with no controller connected does nothing except show a message ("Connect a controller and press a button first.").
- [ ] Tapping the rows with a finger works too.

All of the Duelist's attacks are meant to be dodged from their warning (the arm pose and the glow), not reacted to after they start: jump or dash during the warning. If you feel you "could not dodge in time", tell me, that is useful to know and the timing can be tuned.

Send me your impressions in plain words: what feels too fast, too slow, too hard, too easy, unfair or boring. Every number is tunable, so "the slam is too quick" is enough.

## Things I would like to know
After playing, answer these in plain words:
- Does the counter feel too easy or too hard? Note that it can also be triggered by mashing attack, and by a swing that faces away from the boss (the game only checks that you are close and press attack in the window).
- Is the fight too short or too long?
- Is the Victory / Defeated message too quick? It shows for 1 second before the summary appears.
- Would a sign of when the counter window opens help (for example a flash on the boss)?
- Which of the seven values matters most for how hard the fight feels?
- Do the Easy and Hard presets feel right, or should some values change?
- Does Hard feel like a step up from Normal, or like a wall (several values change at once)? Is 3 damage (two mistakes end the fight) too harsh?
- Was anything in the menu confusing?
