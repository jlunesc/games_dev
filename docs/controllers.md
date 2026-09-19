# Measured controller mappings

Measured with the controller test screen on 2026-09-19. Positions are physical. The SN30 Pro prints the Nintendo layout: B at the bottom, A on the right, Y on the left, X on top. A different pad, mode or browser can give different numbers, so each controller needs its own profile keyed by its id string (see `docs/SPEC.md` section 5).

## Phone: 8BitDo SN30 Pro, Galaxy S21, Chrome 153, X-input mode

Only X-input mode connects to the phone. Chrome reports `mapping: standard`, but the numbers are not the standard ones.

- id: `8Bitdo SN30 Pro (STANDARD GAMEPAD Vendor: 045e Product: 02e0)`
- 16 buttons, 4 axes.

| Physical input | Button or axis |
|---|---|
| Bottom face button (printed B) | button 0 |
| Right face button (printed A) | button 1 |
| Left face button (printed Y) | button 3 |
| Top face button (printed X) | button 4 |
| Left shoulder | button 8 |
| Right shoulder | button 9 |
| D-pad up, down, left, right | buttons 12, 13, 14, 15 |
| Left stick | axes 0 (sideways) and 1 (up and down) |
| Triggers | nothing registers |
| Right stick | nothing on axes 2 and 3; buttons 6 and 7 respond erratically and rest at about 0.50 |
| Back, start, home, stick clicks | not measured |

Button 2 is unused. Treat buttons 6 and 7 and the right stick as unusable in this mode.

## PC: generic X-Box pad, Firefox 145 on Linux

- id: `146b-0609-Generic X-Box pad`
- `mapping: standard`, 17 buttons, 6 axes.
- All buttons follow the standard layout, including home (16) and the stick clicks (10, 11).
- Triggers arrive as axes 4 and 5 (rest at -1.00), and buttons 6 and 7 stay at 0.
- The sideways axes of both sticks (0 and 2) were only moved slightly, so their range is unverified.

## Not yet measured
Back, start, home and stick clicks on the SN30 Pro; any other 8BitDo mode; Firefox on the phone.
