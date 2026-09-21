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
Open the app with the controller connected. The menu lists these rows: **Fight**, **Boss**, **Difficulty**, **Study**, **Tweak difficulty**, **Stats**, **Settings** and **Controller test**. The line at the bottom says which controller the phone found; if it says "No controller detected", press any button on the controller so the phone notices it.

How to move: up and down (d-pad or left stick) move the highlight, and it wraps around from the last row to the first. Left and right change the value of the row you are on (Boss, Difficulty, Study). On the Boss row they switch between the two bosses, the Ember Duelist and the Ashen Hound (from the last one it goes round to the first). The bottom button chooses the row, and the top button goes back. During a fight, hold the top button for about a second to leave. You can also tap any row with a finger.

The menu remembers your last choices (boss, difficulty, study and any tweaks), even after you close the app. It opens with Fight highlighted, so pressing the bottom button once starts the same fight as last time. After a fight the summary comes first, so it takes two presses: one to leave the summary, one for Fight.

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

**The summary.** After every fight (a win, a loss, or leaving with the top button) a summary appears instead of the next fight starting. It shows the result ("Victory!", "Defeated" or "You left the fight"), the time (the real fight only; if you played a study first, a "Study time" line shows how long it took), the phase reached, the hits you took, the boss's health left, and the attack that hurt you most (if nothing hit you, it says "You were never hit."). The bottom button (or tapping "Back to the menu") returns to the menu. For about half a second at the start the controller is ignored, so a button you were still pressing in the fight does not skip the summary by accident. Under the lines, a last line says whether the fight was saved on the phone (see "Stats and export" below).

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

## Boss movement (M5a): the Ashen Hound
A second boss, the **Ashen Hound**, is new. It is a low, fast beast that dashes and jumps, and it is here to train reading a movement and stepping out of the way of where something will land. The Ember Duelist is unchanged and should play exactly as before.

### How to pick it
In the menu, go to the **Boss** row and press left or right. The row shows the name (Ember Duelist or Ashen Hound). The menu remembers your choice, even after you close the app. Then choose Fight as usual. The Easy, Normal and Hard presets and the Tweak screen work for the Hound too. Everything else (controls, summary, stats) is the same.

### What to expect
The Hound has four attacks. It has no gold attack, so there is no counter against it: every attack is dodged or avoided. It attacks from a shorter distance than the Duelist, and now and then it does two attacks in a row.
- **Bite** (arm out to the side, red glow): a short snap in front of it. The warning is short (a bit over a third of a second), and it is the tight one: a dash has to be started inside a window of only about a tenth of a second, and a jump gives about twice that. Jumping over it or stepping back out of reach also works.
- **Rush** (arm pulled back, red glow): it runs straight at you very fast, from farther away, and hurts along the whole run. You cannot outrun it. Dash through it.
- **Slip** (arm pulled back too, red glow): it looks like the rush, but it starts from closer and its warning is shorter. It runs at you and past you, and **it never hurts by itself**. Nothing to dodge; it only puts the Hound behind you, so turn around. The Easy preset leaves the slip out (it keeps only the bite, the rush and the pounce), so to see it use Normal or Hard. (Dashing for no reason is just a waste of your dash.)
- **Pounce** (it crouches: the body goes lower, the arm hangs low in front, red glow): after the crouch it jumps in a high arc and lands where **you were standing when it took off**. At the moment it leaves the floor, a **red bar** appears on the floor. The bar shows where the landing shockwave will be and on which side: it starts at the landing spot and runs to the side the Hound is facing (its facing does not change in the air). The crouch before the jump lasts half a second, so you can cross to the other side of the Hound before it takes off. If you do, the bar points back over the flight path, and that is correct. The bar does not move once the Hound is in the air, so if you leave the bar's area you are safe. When the Hound lands, the bar is replaced by a low red shockwave along the floor for a moment. It hurts if you are **on the ground** inside the bar. It does not hurt if you jump over it or stand outside it.
  While it is high in the air your swing cannot reach it, so do not attack then. After it lands it can be hit again, and its recovery after the pounce is a good moment to hit it.

A soft shadow on the floor shows where the Hound is while it is in the air.

### Checklist
- [ ] The Boss row switches between the Ember Duelist and the Ashen Hound with left and right, and the menu remembers the choice after closing and reopening the app.
- [ ] The Duelist still plays exactly as before: the same feel, and about the same numbers on the summary for a similar fight.
- [ ] Before a pounce the Hound crouches (it gets lower), and you can see it coming.
- [ ] When the Hound leaves the floor, a red bar appears on the floor that starts at the landing spot and runs to the side the Hound is facing (even if you crossed it during the crouch, so the bar then points back over where it flew).
- [ ] The red bar does not move while the Hound is in the air (even if you run around).
- [ ] The landing shockwave hurts you if you are on the ground inside the bar, and does not hurt if you jump over it or stand outside it.
- [ ] Your swing does not hurt the Hound while it is high in the air, but it does after it lands.
- [ ] The slip never hurts by itself, however you stand. (The Easy preset leaves the slip out: it keeps only the bite, the rush and the pounce, so test this on Normal or Hard.)
- [ ] The rush hurts if you stand in its way and is dodged with a dash.
- [ ] The bite gives very little time to dash (about a tenth of a second) and a jump gives about twice that. Note which answer you use and how often it works.
- [ ] Stats for Hound fights save (the summary's last line counts them), export and show up in the Stats screen like the Duelist's. When you send the exported file I replay every fight from it, to check that the Hound fights replay exactly.
- [ ] After a few tries, you know what to do against each of the four attacks.

### Questions about the Hound
- Is the bite too tight? Could you dash it, or only guess?
- Is the red bar readable enough? Can you tell where it will land and which side is dangerous?
- Is the pounce fair: is there enough time to react between the bar appearing and the landing (about a third of a second)?
- Can you tell a rush from a slip? Do you find yourself dashing at slips?
- Do you know what to do against each attack after two or three tries?
- Is the Hound too easy or too hard on Normal?
- Did anything look wrong while it was in the air (the jump, the shadow, the bar, the body)?

## The arena (M5c)
The Ashen Hound's fight now has a **scenery**: two **ledges** (raised platforms) and one **wall** (a low pillar) standing in the arena. The Ember Duelist's arena is still completely flat and plays exactly as before. Everything in the arena is a first guess, and this test is to find out how it feels.

### What is in the arena
- **Two ledges**, one on the left and one on the right, each about one sixth of the screen wide and **90 high** (a bit less than the height of you, which is 96). They are lighter slabs with a glowing top edge.
- **One wall** in the middle of the arena, narrow and **100 high**, a dark solid block with a lighter top edge.

### How to use them
- **Getting up on a ledge.** Jump from below: you pass **through** the ledge on the way up, and when you come down you **land on top** of it. Hold the jump button, because a quick tap only hops a little and does not reach 90. On top you can stand, run, jump, swing and dash like on the floor, and you drop off by walking off the edge. You do not have to be fully over the ledge to stay up: even a small part of your body over it holds you.
- **From a ledge your swing cannot reach the Hound while it is on the floor**, so you cannot hit it from up there (and the counter, which the Hound does not even have, would not work from there either). Come down to hit it.
- **The wall stops you sideways.** You cannot run through it, and a **dash stops** when it hits the wall. You can jump **onto** it (it is 100 high and a jump goes up to about 155) and stand on top, or jump **over** it.
- **The Hound walks straight through the wall and the ledges** (a first simplification; it will look odd, and it is on the list to fix). The wall does not stop the Hound. What the wall does is stop the Hound's **attacks**, when the Hound is on the other side.

### What is safe where
- **On a ledge** (90 high): you are safe from the pounce's low shockwave (it is only 60 high, so it passes under your feet). You are **not** safe from the bite (110 high) or the rush (100 high): both still reach you up there.
- **Behind the wall** (the wall between you and the Hound): the wall stops the rush and the pounce's shockwave that come from the Hound's side, because it is at least as tall as they are (100 and 60). It does **not** stop the bite (110 high): the bite passes over the wall and still bites you behind it. The wall protection only holds **while the Hound is on the other side of the wall**: once the Hound is standing inside the wall or has walked past it, the wall no longer blocks anything. So a rush that ends inside the wall can still hit you just behind it. And the pounce lands where **you were standing when it took off**, so hiding only works if you step behind the wall after it takes off.
- **On top of the wall** (100 high): the bite (110 high) still reaches you up there. The rush (100 high) only touches your feet and the pounce's shockwave (60 high) passes below, so those two should not hurt you on top of the wall. You cannot hit the Hound from there either. So the top of the wall is not a place to hide forever, but please check this by feel (see the questions).

### Checklist
- [ ] Choose the Hound. You can see two ledges and one wall in the arena, and the wall looks different from the floor (a dark solid block) and from the ledges (light slabs).
- [ ] You can jump up from below through a ledge and land on top of it. A short tap of jump does not get you up.
- [ ] On a ledge you can stand still, run along it, jump from it and walk off the edge and fall.
- [ ] The wall stops you when you run into it, from both sides.
- [ ] A dash into the wall stops at the wall.
- [ ] You can jump onto the wall and stand on it, and you can jump over it.
- [ ] Standing on a ledge, you are not hurt by the pounce's low shockwave. Note what the bite and the rush do to you up there (by the numbers they should still hit you).
- [ ] Standing on a ledge, your swing does not hurt the Hound while it is on the floor.
- [ ] Behind the wall, the rush and the pounce's shockwave coming from the Hound's side are stopped, as long as the Hound is on the far side. The bite is **not** stopped (it should still bite you behind the wall). Note any time the rush or the shockwave hurt you while behind the wall, and where the Hound was then.
- [ ] Standing on top of the wall, the bite still hurts you; the rush and the pounce's shockwave should not. Note what happens if you stay up there.
- [ ] The Hound walks through the wall and the ledges without being stopped (expected for now).
- [ ] The Duelist's arena is flat, and the Duelist plays exactly as before.
- [ ] Stats still save (the summary's last line counts them) and Export works. In the exported file, the `evasion` of an attack you avoided by standing on a ledge or the wall can say `platform`, and behind the wall it can say `cover` (see `docs/stats.md`).

### Questions about the arena
- Are the ledges too high or too low? Is 90 a good height to jump up to?
- Is the wall in a good place? Is it too far from where you usually stand?
- Does hiding behind the wall feel too safe, or too useless (it stops the rush and the shockwave but not the bite, the Hound walks through it, and the pounce lands where you were)?
- Can you tell what a ledge and the wall do at a glance, without trying them?
- Does the wall look clearly different from the floor and from the ledges?
- Did you find a place where you could not be hurt at all? (There should be none: the bite reaches you behind the wall and on top of it.) Did that spoil the fight?
- Did anything feel wrong with the ledges, for example landing on them, or hanging half over the edge?

## The study phase (M5b)
A new step before the real fight: a **study**, in which the boss shows you its attacks and nothing can hurt you. The idea is to learn to read each attack first, then fight for real. The boss and the fight itself are unchanged.

### The Study row
In the menu, **Study** sits between **Difficulty** and **Tweak difficulty**. Left and right (or the bottom button, or a tap) go round three values: **Off**, **Once** and **Twice**. It starts on **Once**, and the menu remembers your choice, even after you close the app.
- **Off**: the fight starts straight away, like before.
- **Once**: the boss shows each of its attacks one time before the fight.
- **Twice**: it shows the whole set two times, each time in a new random order.

### What happens in the study
- The fight starts in the study. For about one second a small note near the top of the screen says "Study: watch what it can do. Nothing can hurt you." (it does not cover the action and it never blocks a tap), and then it goes away. The boss's name at the top right has "STUDY" in front of it for the whole study, as the reminder.
- The boss shows the attacks of its **first phase** only, one after another, in random order. Each one has its normal warning, its normal speed and its normal pause before the next one. For the Ember Duelist that is the slam, the sweep and the lunge (not the ground burst, which only comes in phase 2, so you meet it for the first time in the real fight). For the Ashen Hound it is the bite, the rush, the slip and the pounce. Each attack is shown as the boss would use it: it walks towards you first if you are far away.
- You can move, jump and dash as much as you like, to practise dodging. **Nothing can hurt you**: your hearts stay full. You **cannot hurt the boss** either: your swing does nothing to it, and the counter does not work.
- When an attack would have hit you, you get the usual red flash and a soft, low sound, and you lose nothing. (The flash follows the Flashes switch in Settings and the sound follows the Sound switch. There is no freeze and no screen shake in the study.)
- When the last attack has been shown, the same small note at the top shows "The fight begins!" for about one second. From then on it is the real fight: the boss is at full health and waits its normal pause before its first real attack, and every hit that lands hurts you as usual. You stay where you were.
- On **Easy**, the preset leaves some attacks out of the fight (the Duelist's lunge, the Hound's slip). The study shows only the attacks that are in that fight, so on Easy you will not see those either. Tweaking Variety does the same.
- How long it is: with Once, roughly 6 to 9 seconds; with Twice, roughly 12 to 17 seconds.

### Leaving during the study
Hold the top button for about a second, as in any fight. The summary says "You left the fight" and, under it, "You left during the study.". Its time is 0:00, because no real fight had started, and the "Study time" line shows how long you stayed in the study. The study fight is saved like any other left fight.

### The summary and the stats
The summary's **Time** counts the real fight only; a **Study time** line under it shows the study (it is left out when you played with Study Off). The saved stats mark the study fights and keep the study apart from the real fight (details in `docs/stats.md`, section 7.5), so Export works as before.

### Checklist
- [ ] The Study row is between Difficulty and Tweak difficulty, and left and right cycle Off, Once, Twice (and round again). The bottom button and a tap also cycle it. Close and reopen the app: it remembers your choice. A fresh install starts on Once.
- [ ] With **Off**, the fight starts straight away, with no study line, like before.
- [ ] With **Once** on the Ember Duelist, the boss shows exactly the slam, the sweep and the lunge, each one time, in a random order, and never the ground burst. Try a few fights: the order changes.
- [ ] With **Once** on the Ashen Hound, the boss shows exactly the bite, the rush, the slip and the pounce, each one time. On Easy the Hound has no slip, and the Duelist has no lunge, so you see only the attacks that are in the fight.
- [ ] With **Twice**, each attack is shown two times, and the two rounds are each in a random order (now and then both rounds may happen to be in the same order, that is chance).
- [ ] The study note "Study: watch what it can do. Nothing can hurt you." appears small at the top of the screen (below the health bar), does not cover the action, and disappears after about one second. "STUDY" and the boss's name stay at the top right during the whole study. "The fight begins!" then shows in the same place for about one second when the study ends, and goes away.
- [ ] In the study your hearts stay full. Standing in an attack gives the red flash and a soft low sound, and costs nothing.
- [ ] In the study your swing does nothing to the boss (no hit flash, no damage), even in the window of the gold slam (the counter does nothing).
- [ ] After "The fight begins!" the real fight hurts you normally, and your swing hurts the boss again. The boss has full health.
- [ ] The boss's pause and speed in the study feel like the real fight (same warning, same speed).
- [ ] The summary's Time is the real fight only, and a "Study time" line shows the study. With Off there is no Study time line.
- [ ] Leaving with the top button during the study shows "You left the fight" and "You left during the study.", and the fight is saved.
- [ ] The stats save the study fights (the summary's last line counts them) and Export still works. When you send the file I replay every study fight from it, to check that they replay exactly.

### Questions about the study
- Does the study help you learn the attacks?
- Is it too long or too short? How many seconds does it feel like with Once and with Twice?
- Should the boss be hittable in the study, so you can practise your punishes too?
- Can you read the study note, and "The fight begins!", in the short time they show? Do they get in the way?
- Is the soft low sound audible? Is it annoying?
- Is the red flash enough to tell you an attack would have hit you?

## Stats and export (M3b)
### What is recorded
The game now keeps a record of every fight you play: which boss and difficulty, and the exact buttons you pressed on every step of the fight. From that the game works out the numbers we will study together: how long you took to react to each attack, whether you dodged, got hit or countered, how you moved, and whether you punished the boss after its attacks. A finished fight (a win or a loss) and a fight you leave after it started are saved by themselves, and the summary ends with "Fight saved (3 on this device)." (the number is how many fights are saved). A fight you leave before it started is not saved.

Everything stays **on the phone**. Nothing is uploaded anywhere: the file only goes where you send it. The details of the file are in `docs/stats.md`.

### The Stats screen
In the menu, the **Stats** row sits between **Tweak difficulty** and **Settings**. It shows when you last exported ("Last export: never." at first) and a reminder that Android can clear browser data, so export now and then. It has three rows:
- **Export**: shows how many fights are saved. While it works the screen says "Working…". It packs them into one file (its name ends in `.stats.json`, for example `boss-trainer-2026-09-21.stats.json`) and hands it to the phone.
- **Delete all fights**: asks twice. The first press changes the row to "Really delete all fights? Press again.", the second press deletes. Moving to another row cancels it. Export first.
- **Back**: return to the menu.

### How to export and send
1. Play some fights, then open **Stats** in the menu.
2. **Tap Export with your finger** (do not press it with the controller). The phone's share sheet may not accept a controller button press, so if you press it with the controller the file may only download to the phone instead of opening the share sheet.
3. In the share sheet, choose where to send the file: for example save it to Drive, or send it to yourself in a chat or email. If the phone downloaded it instead, the screen says "File saved to your downloads." and the file is in the Downloads folder.
4. Send the file to me for the analysis, the way that is easiest for you.
5. After a good export the screen says "Sent." (share sheet) or "File saved to your downloads.", and "Last export" shows the date. That date is in UTC, so around midnight it can be a day off from your local date.

Android can clear a browser's data by itself (for example when the phone is short of space), and that would delete the saved fights. So export now and then, and always before you delete anything. Exporting does not remove the fights from the phone; they stay until you use Delete.

### Checklist
- [ ] After a win, a loss and after leaving in the middle of a fight, the summary's last line says "Fight saved (n on this device)." with n going up by one each time.
- [ ] A fight left before it started is not saved. This is hard to do on purpose (holding the top button takes about a second, and the fight is already running by then), so skip it if you cannot. One way: start a fight and switch the controller off at once, then tap the "No usable controller" message (if a moment of the fight already ran, it will be saved as a left fight, which is also fine). You should land in the menu and the count should not go up.
- [ ] The Stats row is between Tweak difficulty and Settings, and the number next to Export matches the fights you played.
- [ ] Tapping Export opens the phone's share sheet (or, if the phone cannot, downloads a file). Note which one happened.
- [ ] Pressing Export with the controller instead of a finger: note what happens (share sheet, only a download, or nothing).
- [ ] The file's name ends in `.stats.json`.
- [ ] After a successful export, "Last export" shows today's date.
- [ ] Delete asks twice, and afterwards the count is 0 and the screen says "All fights deleted." (Export first if you want to keep the fights.)
- [ ] Close the app fully and open it again: the fights are still there (the count on the Stats screen is the same).
- [ ] The game still plays normally with airplane mode on, and fights are still saved offline.
- [ ] Nothing pauses or stutters when a fight ends and is saved.
- [ ] On a long fight (2 minutes or more) note whether the game pauses for a moment when the fight ends; how long?

## Things I would like to know
After playing, answer these in plain words:
- Does the counter feel too easy or too hard? Note that it can also be triggered by mashing attack, and by a swing that faces away from the boss (the game only checks that you are close and press attack in the window).
- Is the fight too short or too long?
- Is the Victory / Defeated message too quick? It shows for 1 second before the summary appears.
- Would a sign of when the counter window opens help (for example a flash on the boss)?
- Which of the seven values matters most for how hard the fight feels?
- Do the Easy and Hard presets feel right, or should some values change?
- Does Hard feel like a step up from Normal, or like a wall (several values change at once)? Hard costs 2 hits per attack, and the Tweak maximum of 3 leaves only two mistakes: is either of those too harsh?
- Was anything in the menu confusing?
- Did the phone offer the share sheet when you tapped Export, and did the file reach where you wanted it? What happened when you pressed Export with the controller?
- Did saving a fight at the end cause any pause, even a small one? Was it longer after a long fight (2 minutes or more)?
