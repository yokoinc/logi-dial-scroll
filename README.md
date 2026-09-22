# DialAccel

*[Version française](README.fr.md)*

Accelerated scrolling for the **Logitech MX Creative Console**, on Windows.

Turn a dial and the plugin sends Up/Down arrows. The faster you turn, the more it
sends — one slice per detent when you go slowly, a burst when you sweep. Built to
scroll through slices in a DICOM viewer such as OHIF, but it works with anything
driven by arrow keys.

The Logitech counterpart of the Stream Deck plugin
[yokoinc/elgato-dial-scroll](https://github.com/yokoinc/elgato-dial-scroll).

---

## Why

Reading a CT scan means travelling through hundreds of slices, then coming back to
three of them to compare. Those two gestures do not ask for the same thing:
travelling wants speed, comparing wants to land on the slice you meant and not its
neighbour. With a mouse wheel in OHIF, one notch is one slice: precision is
perfect, and crossing a 400-slice series becomes an endurance exercise.

Options+ can bind a key to a dial, and nothing more: one detent, one keystroke.
Its "wheel speed" slider multiplies everything uniformly, so every bit of sweep
speed costs exactly as much precision.

Hence this plugin. It does three things the Options+ setting cannot:

- **A curve instead of a factor.** A slow gesture stays one-to-one; a fast one
  accelerates logarithmically — never exponentially, which runs away.
- **One profile per control.** The small roller keeps slice-by-slice precision and
  speeds up only if you spin it. The large dial is for travel. Two distinct tools
  on the same device.
- **Smoothed output.** Slices are spread over time instead of leaving in one
  burst, which reads as a continuous glide rather than a series of jumps.

Every shipped value comes from recordings made on the device rather than from
intuition: the plugin can log each event received and each slice sent, and those
recordings are replayed outside the plugin to measure what a change does before it
is deployed.

---

## Install

Three steps, and no development tooling.

### 1. Drop the plugin in

Download [`DialAccel.lplug4`](DialAccel.lplug4). It is a plain zip: extract its
**contents** — not the folder — into

```
%LOCALAPPDATA%\Logi\LogiPluginService\Plugins\DialAccel
```

You should end up with `index.mjs`, `metadata\`, `node_modules\` and the two icon
folders directly inside `DialAccel`.

### 2. Reload the plugin

The Plugin Service never re-reads a plugin on the fly. The supported reload goes
through a `loupedeck://` link, handled by the service's own tool:

```
& "C:\Program Files\Logi\LogiPluginService\LogiPluginServiceTool.exe" "loupedeck://plugin/DialAccel/reload"
```

It worked when the log says `Starting remote plugin: DialAccel`. Nothing to quit,
neither Options+ nor the console.

After **adding or renaming an action**, also bump the version number in
`LoupedeckPackage.yaml`: without that, Options+ keeps its cached action list and
the new action shows up nowhere.

### 3. Assign the actions in Options+

Open the device customization screen. Two actions appear under **Dial Accel
actions**:

| Action | Assign it to | What it does |
|---|---|---|
| **Défilement OHIF — petite molette** | the roller, top right | Precision: one slice per detent, speeding up if you spin it. |
| **Défilement OHIF — grand cadran** | the centre dial | Travel: crossing the series. |

Two things that waste time here:

- **Assign them in the right profile.** The tabs at the top of the screen are
  per-application profiles, and the console follows the foreground application. An
  action assigned in the default profile will not fire in your browser. Pick the
  tab for the application you actually use.
- **The centre dial always draws an on-screen overlay**, whatever you put on it.
  The roller does not. If that overlay bothers you, assign both actions to the
  roller in two different profiles rather than to the dial.

---

## Tuning

Everything lives at the top of [`src/scroll-model.ts`](src/scroll-model.ts), in
`Profiles`. Each control has its own, because they share neither scale nor
purpose. Measured on the device, with the Options+ "wheel speed" slider at 50%:
the roller sends a `tick` of 2 to 7, the large dial 7 to 80.

### Large dial — `dial` profile

It already accelerates on its own, its `tick` growing with speed. Our curve only
adds a peak on top, hence a deliberately low `gain`:

| gain | 1 to 8 detents give | feel |
|------|---------------------|------|
| 0    | 1, 2, 3, 4, 5, 6, 7, 8 | leave it all to the device |
| 0.3  | 1, 2, 3, 4, 5, 6, 8, 9 | the shipped default |
| 0.6  | 1, 2, 3, 4, 5, 7, 9, 11 | brisk |
| 0.9  | 1, 2, 3, 4, 5, 7, 10, 12 | aggressive |

`lowSpeedBoost` lifts the bottom of the curve without touching the top. Turning
the dial slowly does not send smaller `tick` values — they stay at 7 — but events
further apart, up to 190 ms: a slow gesture fell to 22 slices per second where a
fast one gives 260. At 0.8, with `lowSpeedRef: 150`, slow gestures gain 60 to 75%
and fast ones less than 10%.

### Roller — `roller` profile

Its `tick` values stay small even when spun fast: its speed shows in how often
events arrive, not in how large they are. Its acceleration therefore follows the
measured rotation speed, in slices per second, rather than the size of the `tick`:

| speed | multiplier |
|---|---|
| up to 30 slices/s | 1 — one detent, one slice |
| 60 slices/s | 1.7 |
| 100 slices/s | 2.2 |

An isolated detent is never accelerated: after a pause, measured speed starts back
from zero.

### Shared

| setting | what it does |
|---|---|
| `ticksPerSlice` | the `tick` value worth one slice. 2 means the roller advances one slice per detent. |
| `rateSmoothing` | how much inertia the output rate has, 0 to 1. 1 jumps with every event; 0.35 ramps gently. |
| `debugLog` | logs every event received and every slice sent. |

The Logi SDK 0.1.1 exposes no settings panel, so changing these means rebuilding
(see below).

### Tuning on measurements rather than on feel

Set `debugLog: true`, rebuild, reload, then use the dials for half a minute. The
log then holds each event's `tick`, the measured speed and the slices sent. **Copy
it straight away**: it is wiped on every service restart.

That recording is then replayed outside the plugin, straight through the sources,
without touching the console:

```
node --experimental-strip-types my-bench.mts recording.log
```

`src/scroll-model.ts` depends on neither the SDK nor Windows, precisely for this.
You can measure, before deploying, what a setting does to a real gesture: slices
per second, worst slice count on a single frame, how even the scroll is.

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
| **Nothing at all** when you turn the dial | Either the action is assigned in a profile that is not the active one (see step 3), or the plugin is deaf — see just below. |

### The plugin starts, connects, and receives nothing

A disconcerting symptom: the log shows `[…] demarrage du plugin`,
`user32 charge via koffi` and `Init connection confirmed by server`, everything
looks perfect, and yet no event arrives when you turn the dial.

This is what happens when the plugin is restarted **by killing its `node.exe`
process**. The service does start a replacement, which connects, but the service
keeps routing events to the old connection. The telltale sign: the line
`Starting remote plugin: DialAccel`, written by the service itself, is missing
from that restart.

The cure is the reload from step 2. Never kill the plugin's process.

### `Plugin runtime 'NodeJs22' not yet installed`

The Plugin Service unpacks its runtime into a folder named `node22`, then looks
for it under `nodejs22`. Giving it both names fixes this for good:

```
$h = "$env:LOCALAPPDATA\Logi\LogiPluginService\PluginHosts"
New-Item -ItemType Junction -Path "$h\nodejs22" -Target "$h\node22"
```

If it answers that the target does not exist, open Logi Options+ and let it finish
starting — it fetches the runtime by itself — then run the command again.

### About accents

The log is ASCII-only, so accented characters come out as garbage there. That is
expected. The labels shown in Options+ do keep their accents, and must: action
search in Options+ is accent-sensitive.

---

## Build from source

```
npm install
npm run build:pack
```

This produces `dist/` and `DialAccel.lplug4`. Install as in steps 1 and 2 above.

No need to install Node: the Plugin Service ships its own, with npm, in
`%LOCALAPPDATA%\Logi\LogiPluginService\PluginHosts\node22\node`.

`npm run link` also exists, but only symlinks `dist/` into the plugins folder.
Handy while developing, unsuitable for real use: deleting the source folder would
break the plugin.

Rebuilding while the plugin runs works — `clean` deliberately spares
`dist/node_modules`, because the plugin holds koffi's native binary open and
deleting it would fail every build.

---

## How it works

The console does not report one detent at a time. Its firmware already batches
them by rotation speed, and each control has its own scale: the roller sends a
`tick` of 2 to 7, the large dial 7 to 80. A fixed `ticksPerSlice` per profile turns
that `tick` into slices — not a calibration on the smallest `tick` seen, which
conflated the two controls and made sensitivity jump mid-session.

The plugin then adds its acceleration, according to the profile: on the size of the
`tick` past a threshold for the dial,

```
slices = detents × (1 + gain × ln(1 + (detents − threshold) / knee))
```

and on measured rotation speed for the roller. Below the threshold the multiplier
is exactly 1: one detent, one slice, always. Past it, the rise is logarithmic
rather than exponential. A third term, `lowSpeedBoost`, does the opposite of an
acceleration: it lifts slow gestures and fades out as soon as the gesture gets
fast.

Slices do not all leave at once. An event arrives roughly every 32 ms, sometimes
two of them 5 ms apart, so sending twenty slices in a single `SendInput` produced
a staircase: twenty slices on one frame, nothing on the next two. The first slice
now leaves immediately and the rest are spread by a timer over the observed
interval between events — Windows rounds `setTimeout` to 15.6 ms, which is one
frame at 60 Hz, the finest granularity OHIF can display anyway. The rate itself is
smoothed, so speed ramps instead of stepping.

The fractional remainder carries from one event to the next, then is dropped at
the end of a gesture or on a reversal: an isolated detent is always exactly one
slice, and turning back stops the scroll in flight.

Keystrokes are delivered through Win32 `SendInput`, called straight from Node via
[koffi](https://koffi.dev/) — no child process, no script.

---

## Limitations

Logitech's Node SDK is at version 0.1.1, in beta. It offers no settings panel, no
touch-strip action, and no per-application filtering from the plugin. The centre
dial always draws its overlay. None of that can be worked around from the plugin.

The plugin also cannot tell which control sent an event: assigning two distinct
actions in Options+ is what stands in for telling the roller and the dial apart.
