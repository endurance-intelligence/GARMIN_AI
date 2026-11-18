# GARMIN_AI Horizon v0.9.8 — weather intelligence

## Product contract
- Use one read-only weather model in Coach, Training Calendar and Race Prep.
- Training location can be chosen by **search** or by tapping "current location".
  Geolocation is **never requested without a user gesture** and coordinates
  are rounded to ~1 km. The place is stored in browser localStorage only.
- Race location is separate from training location; a race must use the
  event's coordinates if available, else geocode its event city. The current
  Race Prep still shows a demo event, so the user selects race city manually.
- Open-Meteo forecast with UNIX timestamps and its timezone, 16 days maximum,
  30-minute in-memory cache, no API key. The location remains local to the
  browser, but forecast requests send the selected coordinates to Open-Meteo.
- Weather-only training slot: compare 1-hour steps between 06:00–21:00
  on the planned date, for 30–180 minutes. Prefer non-hazardous,
  daylight, low precipitation, low gusts. Never invent a physiological
  readiness score or override a fixed Garmin training start time.
- The slot is **not** an availability/coach assessment. It does not yet
  exclude work meetings, injury, illness, heat adaptation or fixed run clubs.
- Race weather: require **race date** and **start time**; display actual
  forecast segments every 3 hours over a configurable duration.
  No alternate suggested race start time. Partial forecasts are marked.
- **Beyond the 16-day forecast** explicitly label as unavailable.
  Historical weather or climate normals must be a separate, clearly
  labeled future feature, not represented as a live prediction.
- Display temperature, feels-like, precipitation probability, wind and gusts.
  Weather is supporting evidence, **not** a medical clearance.
- Garmin auth, Garmin activity sync, workout scheduling and weight writes are
  not touched by this release.
- Attribution: "Wetterdaten: Open-Meteo" is linked in the UI. Open-Meteo's
  open/free weather API currently has non-commercial use limitations:
  review licensing before commercializing the app.

## Planned Race Weather Intelligence (Endurance Intelligence parity)
- Carry event coordinates through the real Race Prep event model.
- Show an updated forecast on the event detail, without requiring a race
  strategy page to be opened.
- Link weather by **event start + elapsed race hours**, not device time.
- Add GPX route exposure and wind direction only with validated route data.
- Use heat / cold / rain to condition fluid and electrolyte suggestions,
  without automatically increasing carb doses or overriding the fuel log.
- Forecast-change detection when the model updates, using stored
  forecast evidence and time of update.
- Retain all Garmin write locks until authentication and readback are proven.

## Development validation
- `node --test tests/mobile-weather-intelligence.test.mjs`
- Existing mobile owner-gate, iPhone/iPad, weight and calendar tests.
- `npm run build` through pinned reviewed GitHub Pages source.
