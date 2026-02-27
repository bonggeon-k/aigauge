# Platform Visual QA

This guide defines how to capture and review UI baselines across Windows, Linux, and macOS.

## Scope

- Main window:
  - Dashboard
  - Analytics
  - Settings
- Tray popup:
  - Quick View (`/#/tray`)
- Themes:
  - Light
  - Dark

## Baseline Capture

1. Start the frontend app:

```bash
pnpm dev --host 127.0.0.1 --port 1420
```

2. In a second terminal, capture screenshots:

```bash
pnpm visual:baseline
```

3. Output location:

- `artifacts/visual/<platform>/`

Example files:

- `light-dashboard.png`
- `light-analytics.png`
- `light-settings.png`
- `light-tray.png`
- `dark-dashboard.png`
- `dark-analytics.png`
- `dark-settings.png`
- `dark-tray.png`

## Notes

- First-time setup for Playwright browsers may require:

```bash
pnpm exec playwright install chromium
```

- Override defaults:
  - `AIGAUGE_BASE_URL` for custom host/port
  - `AIGAUGE_VISUAL_DIR` for custom output path

## Review Checklist

- Typography and spacing are consistent with platform profile.
- Header/titlebar controls align with OS conventions.
- Navigation active states and focus states are visible.
- Provider cards and charts retain visual hierarchy in light and dark themes.
- Tray popup remains legible at `420x540` without clipping.
