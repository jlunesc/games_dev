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

## Playing the fight (M1)
Hold the phone sideways (landscape) before you start.

Open the app with the controller connected. The start screen shows which controller it found. Press the bottom button (or tap "Fight the dummy") to start. During a fight, the top button returns to the start screen, where you can also open the controller test. If the start screen says "No controller detected", press any button on the controller so the phone notices it.

Controls: left stick or d-pad to move, bottom button to jump (hold it for a higher jump), left button to attack, right shoulder to dash.

Try each of these and note anything that feels off:
- [ ] Moving with the stick and with the d-pad feels the same and responds at once.
- [ ] A quick tap of jump gives a small hop, holding gives a high jump.
- [ ] Attack: a short swing in front of you. Hitting the dummy makes it flash white, the screen shakes a little, and the game freezes for a moment.
- [ ] Dash: a quick burst, and you cannot dash again for a short moment.
- [ ] The dummy changes color and pulls back as a warning, then sweeps low along the floor. You can jump over it or dash through it.
- [ ] Getting hit: red flash, a short freeze, blinking for about a second. Five hits end the round and the arena restarts by itself.
- [ ] Sounds play for hits, dashes and the dummy's warning. Sound needs one tap on the screen after the app starts. If you started the fight with the controller and there is no sound, tap the screen once (it should then work from the next hit).
- [ ] Turn the controller off in the middle of a fight. The game pauses and says so. Turn it on and press the bottom, left or dash button to continue (the top button goes back to the start screen).
- [ ] Pressing several buttons at once (for example moving while jumping and attacking) works, and fast repeated taps are not lost.

The dummy's sweep is meant to be dodged from its warning (the color change and pull-back), not reacted to after it starts: jump or dash during the warning. If you feel you "could not dodge in time", tell me, that is useful to know and the timing can be tuned.

Send me your impressions in plain words: what feels too fast, too slow, too floaty, too heavy, too easy or too hard. Every number is tunable, so "the jump is too floaty" is enough.
