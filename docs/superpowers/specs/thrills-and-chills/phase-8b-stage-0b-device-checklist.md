# Stage 0b device checklist (for the owner)

This test app is a throwaway. It is never merged and never published. It shows the predrawn pixel pictures on your own devices, so we can read the speed and memory limits there. A result from a real device decides over the computer test.

The test code is on branch `phase8b-stage0b-proto` (never merged). The same code is in the archive `app-src-0b.tar.gz`.

Write every value into the table at the end and send the table back.

## 1. Get the test app

1. Take the archive `app-src-0b.tar.gz`. It holds the test code without `node_modules`, without the built files and without `.git`. (Or check out the branch `phase8b-stage0b-proto`.)
2. On the Windows computer, unpack it into a new, empty folder, for example `C:\Users\<you>\Documents\Game Projects\TC-0b-test`.
3. Open PowerShell in that folder and run these lines one by one:

   ```powershell
   npm ci
   $env:VITE_BENCH = "1"
   $env:VITE_ART = "pixel"
   npm run mobile:sync
   ```

   The two `$env:` lines turn on the Bench buttons and the pixel look. They last only for this PowerShell window. Run them again before every new `npm run mobile:sync`.
4. Then follow Orange Day's `docs/ANDROID-FIRST-RUN.md`, Steps 1 and 3 to 5:
   - Step 1: install Android Studio (skip it if it is already installed).
   - Step 3: File → Open → choose the `android` folder inside the test folder (not the whole folder).
   - Step 4: make a Pixel 6 emulator with API 34 or 35.
   - Step 5: press Run.
5. The app is called "T&C 0b test". It does not replace any other app.

## 2. Android emulator run

The emulator is not a speed test. It checks that the app works inside Android.

1. Does the title screen appear? (yes / no)
2. On the title, find the group "Bench". Press `phone · pixel`. It runs 3 times (about 2 minutes) and then shows a result panel. Does it finish and show numbers? (yes / no)
3. Do the park pictures appear (grass, paths, rides)? This shows that the picture sheets load from inside the app. (yes / no)
4. Export, then Import: in a park, open the menu, press Export, then Import. Write what happens. (Today's download may do nothing inside the app. That is a known open point, not a failure.)
5. Make a save. Close the app from the recent-apps list (swipe it away). Open it again and press Continue. Is the save still there? (yes / no)
6. Press the Android back button on the title screen, and again while a panel is open in a park. Write what happens each time.

Note: the Bench clears the test app's saves each time it runs. Do step 5 before you use the Bench again, or make a new save first.

## 3. Android phone (mid-range)

1. On the phone: Settings → About phone → tap "Build number" 7 times. Then turn on "USB debugging" in Developer options.
2. Connect the phone with a USB cable. In Android Studio, choose the phone at the top and press Run.
3. **App start (B5 device value):** close the app. Start a screen recording on the phone. Tap the app icon. Press Continue (or New park). Stop the recording. Count the time from the tap to the first frame where the whole park is drawn (no empty spots). Write it in seconds.
4. Run all five Bench buttons, one after the other: `phone · pixel`, `phone · today`, `build2 · pixel`, `build2 · today`, `cases · pixel`. Each shows a result panel when it is done. Press "Copy" on the panel and paste the text into a note.
5. Open `cases · pixel` again. Turn the view twice (the Rotate button). Watch for a stutter: none, short, or long?
6. Write the phone model, the Android version, and the screen refresh rate. The refresh rate is the `stepMs` value in the result panel (16.7 = 60 Hz, 8.3 = 120 Hz).

## 4. Older iPhone (iPhone 11 or older)

An iPhone needs a Mac with Xcode, or a cloud device service. If you have neither, write "not run". This run also covers WebKit (Safari's engine), which could not run in the test container.

If you can run it: do the same steps as for the Android phone (section 3).

## 5. Table to send back

One column per device. For each Bench button, copy the values from its result panel.

| Value | Emulator | Android phone | iPhone |
|---|---|---|---|
| Model | Pixel 6 (emulator) | | |
| Android / iOS version | | | |
| Screen refresh (`stepMs`) | | | |
| App start, tap to full park (screen recording, s) | – | | |
| `phone · pixel`: frame p95 / work p95 / turn frame (steps) | | | |
| `phone · pixel`: budget max MB / incomplete after turn / missing / first complete ms | | | |
| `phone · today`: frame p95 / work p95 / turn frame (steps) | | | |
| `build2 · pixel`: frame p95 / work p95 / turn frame (steps) | | | |
| `build2 · pixel`: budget max MB / incomplete after turn / missing / first complete ms | | | |
| `build2 · today`: frame p95 / work p95 / turn frame (steps) | | | |
| `cases · pixel`: frame p95 / work p95 / turn frame (steps) | | | |
| `cases · pixel`: budget max MB / incomplete after turn / missing / first complete ms | | | |
| Stutter when turning in `cases · pixel` (none / short / long) | | | |
| Emulator: title appears | | – | – |
| Emulator: Bench finishes | | – | – |
| Emulator: park pictures appear | | – | – |
| Emulator: Export, then Import (what happened) | | – | – |
| Emulator: save still there after close and Continue | | – | – |
| Emulator: back button on the title / in a panel (what happened) | | – | – |

A tablet, if you have one: the same steps as the Android phone, in its own column. The computer test fired the tablet speed limit (B4), so a real tablet result helps you decide what tablets get.
