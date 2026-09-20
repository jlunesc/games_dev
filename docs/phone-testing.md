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
1. Open the app, press any button on the controller so it wakes up, then tap "Controller test" (or press the top button). A "Gamepad" panel appears. Use the Back button at the top to return.
2. Press every button once and move each stick and trigger through its full range.
3. Tap **Copy report** and paste the text into the chat with Claude. Note which 8BitDo mode it was in. Tapping Copy report with a finger is fine: the report remembers every button you pressed ("ever pressed") and each stick's range, so you do not need to hold anything.
4. Repeat for each mode. The button layout decision (SPEC section 5) will use these reports.

If the controller shows nothing, note which mode it was in and whether the page says the Gamepad API is not available (that means the page is not HTTPS).

## On the PC
`npm run dev`, open http://localhost:5173, plug in or pair the PC controller, and follow the controller check above. Reports from different controllers are expected to differ.

## Playing the fight (M2)
The installed app opens sideways (landscape) by itself. If it does not after an update (Android can take a while to notice a changed app setting), uninstall the app and install it again from the site. In a normal Chrome tab, turn the phone sideways yourself.

Open the app with the controller connected. The start screen shows which controller it found. Press the bottom button (or tap "Fight the Ember Duelist") to start. During a fight, hold the top button for about a second to return to the start screen, where you can also open the controller test. If the start screen says "No controller detected", press any button on the controller so the phone notices it.

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
- [ ] Beating it shows "Victory" and a new fight starts; losing shows "Defeated" and a new fight starts.
- [ ] Fights are not identical: the order of attacks differs from fight to fight.
- [ ] Sounds play for hits, dashes and the Duelist's warnings. Sound needs one tap on the screen after the app starts. If you started the fight with the controller and there is no sound, tap the screen once (it should then work from the next hit).
- [ ] Turn the controller off in the middle of a fight. The game pauses and says so. Turn it on and press the bottom, left or dash button to continue (holding the top button for about a second goes back to the start screen).
- [ ] Tapping the top button during a fight does nothing; holding it for about a second shows 'Keep holding to leave the fight…' and then returns to the start screen.
- [ ] Pressing several buttons at once (for example moving while jumping and attacking) works, and fast repeated taps are not lost.

All of the Duelist's attacks are meant to be dodged from their warning (the arm pose and the glow), not reacted to after they start: jump or dash during the warning. If you feel you "could not dodge in time", tell me, that is useful to know and the timing can be tuned.

Send me your impressions in plain words: what feels too fast, too slow, too hard, too easy, unfair or boring. Every number is tunable, so "the slam is too quick" is enough.

## Things I would like to know
After playing, answer these in plain words:
- Does the counter feel too easy or too hard? Note that it can also be triggered by mashing attack, and by a swing that faces away from the boss (the game only checks that you are close and press attack in the window).
- Is the fight too short or too long?
- Is the Victory / Defeated message too quick? It shows for 1 second before the next fight starts.
- Would a sign of when the counter window opens help (for example a flash on the boss)?
