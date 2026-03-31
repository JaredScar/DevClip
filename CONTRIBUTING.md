# Contributing to DevClip

Thanks for your interest in improving DevClip.

## Development setup

1. Install **Node.js 20+** (22 matches CI) and npm.
2. From the repository root, run `npm install` (runs `electron-rebuild` for `better-sqlite3`).
3. Install Angular dependencies: `cd angular-app && npm install && cd ..` (required for `ng build` / `npm run dev`).
4. Start the app: `npm run dev` (Angular on port 4200 + Electron with `DEVCLIP_DEV=1`).

## Building

- Angular production build: `npm run build:ng`
- Electron/main process TypeScript: `npm run build:electron`
- Full production bundle: `npm run build:all`

## Pull requests

- Keep changes focused on a single concern when possible.
- Match existing code style (TypeScript strictness, Angular standalone components, Tailwind usage).
- If you change behavior, update relevant comments or user-facing copy only where it helps.

## Reporting issues

Include OS version, DevClip version or commit, and steps to reproduce. For crashes, attach logs or stack traces if available.
