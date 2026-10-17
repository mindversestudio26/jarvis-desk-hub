# JANGE 3.1 — design and behaviour notes

3.1 builds on 3.0 without discarding it:

- the radial core
- the split-flap clocks
- the wings and dock
- the storage schema
- the service-worker upgrade path

## Identity: from sci-fi blue to luxury

3.0 was cyan-on-navy with glows. 3.1 moves to a watchmaker's palette:

- obsidian and graphite surfaces
- champagne gold for what matters
- restrained cyan only for live system state
- soft white numerals

Neon text shadows and the blue ambient light are gone. The core became a dial: a sunburst face painted once, gold cardinal batons, a slender gold seconds needle on the outer track that stays clear of the text, and the JANGE emblem as the assistant avatar.

The clocks moved into a crown band across the top, which makes them about 35 % larger. Michroma still sets the labels; Cormorant Garamond italic (self-hosted, OFL) adds a single serif accent for the greeting, alarm labels and the quote.

The 3.1 German Shepherd emblem has since been retired; see `brand/README.md` for the current IMANE emblem.

## Assistant states (core avatar)

States come from real conditions only:

| State | Trigger |
|---|---|
| Idle | Online |
| Processing | Ring pulse while weather or a PC link is being acquired |
| Offline | Ember glint |
| Connection unavailable | Dashed ring when the PC link fails or needs a token |

The CSS hooks for listening and speaking exist but are never set. There is no voice engine, and JANGE never listens. "Hey Jange" is documented as future work in Settings.

## Alarms: what they are and are not

They are a supplementary desk alarm, not a guaranteed wake-up. iPadOS suspends web pages in the background, behind another app, or when the iPad locks. JANGE says this in the alarm panel, records an alarm that falls due while suspended as **missed** (never rung late), and recommends keeping important alarms on the iPhone.

- **Engine** (`alarms.js`, pure, unit-tested): wall-clock times in `Asia/Dubai` or `Asia/Kathmandu` are converted to UTC instants through Intl. Alarms can be once, daily, weekdays, weekends or on custom days. A 10-minute grace window separates a late ring from a missed alarm, and snoozes past the window are missed too. Editing re-anchors an alarm so it cannot fire instantly.
- **Sound**: Web Audio chimes are synthesised, so there are no audio files. The first tap after opening unlocks audio, as iPadOS requires, and `navigator.audioSession.type = 'playback'` is set where supported. The panel shows the sound state and has a Test button. The chime fades in over 45 s.
- **Ringing**: a full-screen alert dialog with gold waves (transform and opacity only). The large time and label have Snooze (5, 10 or 15 min) and Dismiss buttons, and Escape cannot silently dismiss it. After 10 unanswered minutes it stops and records a miss.
- **Recovery**: on reload or return to the foreground, every alarm is evaluated against the clock. Ring state is persisted, so a reload never re-rings a handled alarm.
- **Wake lock**: optional Screen Wake Lock keeps the desk iPad awake while JANGE is in front, with an honest fallback message.
- **Calendar bridge**: "Add to Calendar" exports RFC 5545 iCalendar with VTIMEZONE, RRULE and VALARM, so the iPad's own Calendar can raise the alert when JANGE is closed.

## Shift-aware alarms

No shift backend exists yet; that belongs to Codex's services. 3.1 reads the schedule from sources the owner controls:

1. Shifts entered in JANGE: date, type, start, optional end, zone and note.
2. A roster calendar file (`.ics`) imported from the iPad. The reader is deliberately small. It handles UTC, `TZID=Asia/Dubai|Asia/Kathmandu`, floating times (treated as Dubai) and all-day entries, and it reports repeating events and unsupported zones instead of guessing.

Types are morning, evening, night, other, off, holiday and travel. Each working shift gets one date-specific alarm at **start − (preparation + commute)**. Both durations are owner settings, defaulting to 60 + 30 minutes.

| Rule | Behaviour |
|---|---|
| Missing start time | A working shift without a start time is listed as such and gets no alarm. Times are never guessed. |
| Days without work | Days off, holidays and travel never ring. |
| Duplicate shifts | Shifts with the same zone, date and start collapse into one. |
| Manual alarm at the same moment | A manual alarm within a minute of a shift alarm covers it, so you hear one ring, not two. This holds after the manual alarm has rung. |
| Overrides | Per shift: alarm off, or a custom time. Overrides survive re-imports. A custom time is dropped only if that shift's start time changed. |
| Recalculation | Re-importing a roster replaces imported shifts on those dates, so the alarms recalculate. Changing preparation or commute recalculates every shift alarm. |
| Display | The next alarm and its shift appear under the Dubai or Kathmandu clock and at the top of the Shifts tab. Each shift's alarm is shown in both zones. |

The data lives in `jarvis.shifts.v1` and is included in backups as `shiftPlan`.

**Contract for a future backend feed** (Codex): a JSON array of shift objects in exactly the `shifts.js` shape:

```json
{ "id": "string ≤200", "date": "YYYY-MM-DD", "type": "morning|evening|night|shift|off|holiday|travel", "start": "HH:MM|null", "end": "HH:MM|null", "zone": "Asia/Dubai|Asia/Kathmandu", "note": "≤80 chars", "source": "ics" }
```

The same `merge()` rules apply, so overrides keep working. Nothing in 3.1 calls a backend.

## Daily quote

`quotes.js` holds 60 documented quotations. Each has its source recorded (book, letter, speech or interview, with the translator for translated works) and a Nepali meaning. Popular misattributions were left out on purpose, for example "Be the change…" (not Gandhi) and "It is not the strongest of the species…" (not Darwin).

The screen shows only the quote, the author and the Nepali meaning. One entry is chosen per Dubai calendar day from a fixed order, so nothing repeats for 60 days and adjacent days never share an author. The quote changes at Dubai midnight and works offline. It occupies the slot under the core that 3.1 reserved for future assistant output (`data-slot="assistant"`).

## Weather location and privacy

Weather follows the iPad's location when allowed. Otherwise it uses a chosen city, and otherwise Sharjah.

- JANGE never prompts on its own. The first location request comes from a tap on the locate button. After that it is re-read only when the app opens or returns to the foreground. It uses `getCurrentPosition` with a 15-minute maximum age and never `watchPosition`, so there is no background tracking.
- Device coordinates are rounded to 0.05° (about 5 km) before they are sent anywhere or stored, and to 0.1° (about 11 km) for the place-name lookup. Only rounded values reach:
  - Open-Meteo, for the weather
  - BigDataCloud's free client-side reverse geocoder, for the place name; Open-Meteo has no reverse geocoding
  - the weather cache
- A manual city comes from Open-Meteo's free geocoding search, plus offline presets for Sharjah, Dubai and Kathmandu.
- Offline readings stay labelled "last saved" with their place name.
- The Dubai and Kathmandu flip clocks are fixed and never follow the device location.

## PC link

| State | Shown when |
|---|---|
| Connected | A sample arrives |
| Warming up | The companion answers 503 before its first sample |
| Authentication required | 401; polling stops until you re-pair |
| Unreachable | Any network or CORS failure |
| Not paired | No companion is set up |

CPU, GPU and RAM gauges and temperature appear only from validated samples. A null GPU shows "N/A" and a null temperature shows "No sensor". **Uptime** is displayed only if the companion sends the optional `uptime_seconds` (otherwise "Not reported"). A temperature with `temperature_source: "gpu"` is labelled "· GPU"; the Windows companion cannot read CPU temperature without admin rights.

The five controls (Lock, Sleep, Restart, Shut down, Launch) are styled but disabled until a secure control backend exists. From 3.1.1 the companion also reports NVIDIA GPU load, GPU temperature and uptime (see `companion/README.md`); it still has no control endpoint.

## Performance and accessibility

- The motion budget is unchanged: transform and opacity only, on small layers. The sunburst face and the vignette are painted once. The welcome is about 2 s, never blocks taps, and is skipped under Reduce Motion. Alarm waves animate only while ringing.
- Every touch target is at least 44 px. Switches use `role="switch"`, repeat days are `aria-pressed` buttons in a fieldset, and the ringing dialog is an `alertdialog` with focus on Dismiss. Notices are `role="status"`; deletions offer Undo instead of a confirmation.
- Text contrast on obsidian: soft white about 16:1, gold about 11:1, the third text tier about 5:1.
