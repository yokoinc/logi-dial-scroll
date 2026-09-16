# DialAccel

*[Version française](README.fr.md)*

Accelerated scrolling for the **Logitech MX Creative Console**, on Windows.

Turn the dial, and the plugin sends up/down arrow keys. The faster you turn, the
longer the burst — one keystroke per detent when you creep, a dozen when you
spin. Built to scroll through slices in a DICOM viewer such as OHIF, but it
works with anything driven by the arrow keys.

Logitech counterpart of the Stream Deck plugin
[yokoinc/elgato-dial-scroll](https://github.com/yokoinc/elgato-dial-scroll).

---

## Install

Three steps, and no development tools of any kind.

### 1. Drop the plugin into place

Download [`DialAccel.lplug4`](DialAccel.lplug4). It is a plain zip: extract its
**contents** — not the folder — into

```
%LOCALAPPDATA%\Logi\LogiPluginService\Plugins\DialAccel
```

You should end up with `index.mjs`, `metadata\`, `node_modules\` and the two
icon folders directly inside `DialAccel`.

### 2. Restart the Plugin Service

It never reloads a plugin while running, so this is mandatory:

```
Stop-Process -Name LogiPluginService,LogiPluginServiceExt -Force
Start-Process 'C:\Program Files\Logi\LogiPluginService\LogiPluginService.exe'
```

### 3. Assign the action in Options+

Open the device customisation screen. The action appears under **Actions Dial
Accel**, named **Défilement OHIF**.

Two things that trip people up here:

- **Assign it in the right profile.** The tabs at the top of the screen are
  per-application profiles, and the console follows whichever application is in
  front. An action assigned in the default profile will not run inside your
  browser. Pick the tab for the application you actually use.
- **Prefer the roller, top right.** The large central dial forces an on-screen
  overlay whatever you put on it. The roller does not.

Turn the roller and the view scrolls.

---

## Tuning

Everything lives at the top of [`src/scroll-model.ts`](src/scroll-model.ts).

`gain` sets the acceleration the plugin adds of its own:

| gain | 1 to 8 detents give | feel |
|------|---------------------|------|
| 0    | 1, 2, 3, 4, 5, 6, 7, 8 | leave it all to the device |
| 0.3  | 1, 2, 3, 4, 5, 6, 8, 9 | the shipped default |
| 0.6  | 1, 2, 3, 4, 5, 7, 9, 11 | brisk |
| 0.9  | 1, 2, 3, 4, 5, 7, 10, 12 | aggressive |

Those values are deliberately low: the large dial already accelerates on its
own, its `tick` going from 7 to 80 with rotation speed. Our curve stacks on top
of that one, so a gain that looks reasonable on paper runs away on the device.

Two more settings matter for smoothness:

| setting | what it does |
|---|---|
| `ticksPerSlice` | the `tick` value worth one slice. 2 means the roller advances one slice per detent. |
| `rateSmoothing` | how much inertia the output rate has, 0 to 1. 1 jumps with every event; 0.35 ramps gently. |

The Logi SDK 0.1.1 exposes no settings panel, so changing these means rebuilding
(see below). If you want several strengths available in Options+ without
rebuilding, register several actions with different gains.

`debugLog: true` logs every event received and every slice sent. That recording,
replayed outside the plugin, is what the values above were chosen from.

---

## Troubleshooting

The plugin log is the only source of truth:

```
%LOCALAPPDATA%\Logi\LogiPluginService\Logs\plugin_logs\DialAccel.log
```

| What the log says | What it means |
|---|---|
| `Starting remote plugin` then `Init connection confirmed` | Loaded and healthy. |
| `Plugin runtime 'NodeJs22' not yet installed` | Runtime folder misnamed — see below. |
| `Unknown plugin runtime type 'nodejs'` | The manifest says `nodejs`. It must say `nodejs22`. |
| **Nothing at all** while you turn the dial | The action is assigned in a profile that is not the active one. See step 3. |

### `Plugin runtime 'NodeJs22' not yet installed`

The Plugin Service unpacks its runtime into a folder named `node22`, then looks
for it under `nodejs22`. Giving it both names fixes it, once per machine:

```
$h = "$env:LOCALAPPDATA\Logi\LogiPluginService\PluginHosts"
New-Item -ItemType Junction -Path "$h\nodejs22" -Target "$h\node22"
```

If it answers that the target does not exist, open Logi Options+ and let it
finish starting — it fetches the runtime by itself — then run the command again.

### A note on accents

The log only handles ASCII, so accented characters come out as mojibake. That is
expected. The labels shown inside Options+ keep their accents and must: its
action search is accent-sensitive.

---

## Build from source

```
npm install
npm run build:pack
```

This produces `dist/` and `DialAccel.lplug4`. Install as in steps 1 and 2 above.

`npm run link` also exists, but only symlinks `dist/` into the plugins folder.
It is convenient while developing and wrong for real use: deleting the source
folder would break the plugin.

Rebuilding while the plugin is running is fine — `clean` deliberately spares
`dist/node_modules`, because the plugin holds koffi's native binary open and
deleting it would fail every build.

---

## How it works

The console does not report one detent at a time. Its firmware already batches
them by rotation speed: measured on the device, the roller sends a `tick` of 2 to
7, and the large dial 7 to 80. A fixed `ticksPerSlice` turns that `tick` into
slices — no longer a calibration on the smallest `tick` seen, which conflated the
two controls and changed sensitivity mid-turn. The plugin then adds its own
acceleration past a threshold:

```
slices = detents × (1 + gain × ln(1 + (detents − threshold) / knee))
```

Below the threshold the multiplier is exactly 1: one detent, one slice, always.
Past it, the rise is logarithmic rather than exponential.

Slices do not all leave at once. An event arrives roughly every 32 ms, sometimes
two of them 5 ms apart, so sending twenty slices in a single `SendInput` produced
a staircase: twenty slices on one frame, nothing on the next two. The first slice
now leaves immediately and the rest are spread by a timer over the observed
interval between events — Windows rounds `setTimeout` to 15.6 ms, which is one
frame at 60 Hz, the finest granularity OHIF can display anyway. The rate itself
is smoothed, so speed ramps instead of stepping.

The fractional remainder carries from one event to the next, then is dropped at
the end of a gesture or on a reversal: an isolated detent is always exactly one
slice, and turning back stops the scroll in flight.

Keystrokes are delivered through Win32 `SendInput`, called straight from Node
via [koffi](https://koffi.dev/) — no child process, no script.

---

## Limitations

The Logi Node SDK 0.1.1 is beta. It offers no settings panel, no touch-strip
action, and no per-application filtering from inside the plugin. The large
central dial always shows its on-screen overlay. None of these can be worked
around from the plugin side.
