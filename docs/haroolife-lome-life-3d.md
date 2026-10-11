# HarooLife — Lomé Life 3D

## Architecture et inventaire
The existing HarooLife module uses Next.js 16, React 19, PlayCanvas, local Kenney CC0 GLB models, TypeScript simulation and localStorage saves. The user authentication and Supabase/RLS business flows remain untouched.
New route: /haroolife/territoire/lome. Existing city builder: /haroolife/territoire. The new game uses the existing CityWorld3D and townsmen-engine rather than adding a new renderer.

## Open-source audit

| Repository | Legal | Technical and operational assessment | Reuse |
| --- | --- | --- | --- |
| silverlion2/simlife | README MIT, package.json ISC; no root LICENSE found | Phaser 4 + rex plugins, Electron, browser; modular global window.Game scripts, careers, needs, AI, tests stated but not independently executed | No code copied; incompatible dependencies and ambiguous license |
| ch-bas/threejs-sims-house-builder | MIT, copyright 2026 Bassem Chagra | Next.js 15, React 18, Three.js, Zustand, Vitest; robust multi-floor house editing code | Actual pure camera zoom module copied into vendor/house-builder-camera-zoom.ts without adding Three.js |
| dgreenheck/simcity-threejs-clone | MIT, copyright 2023 Daniel Greenheck | Vite 4, Three.js 0.155, citizens/jobs/building services/vehicle graph; upstream README says no mobile support | City.findTile BFS neighborhood search adapted to pure TypeScript road routes in vendor/simcity-road-path.ts |

Copyright and full license notices: lib/haroolife/vendor/THIRD_PARTY_NOTICES.md. No proprietary assets from The Sims, SimCity, or Townsmen were copied.

## First gameplay loop
1. Launch the actual PlayCanvas 3D neighborhood at day 1, 08:00 with 8,000 fictional FCFA personal wallet.
2. Select market: the player gets a road-only route to the door and advances by one tile per simulated hour.
3. Buy food for 650 FCFA and eat; the personal wallet falls, market revenue and city food stock change, hunger is restored.
4. Pick and visit a job site; salary 3,400 / 4,200 / 3,900 FCFA per completed day for market / bakery / city hall respectively. Once per day, with time and needs requirements, city budget funds wages.
5. Sleep at home, wash at home or well, socialize at market or park; enter and leave accessible buildings with a simplified indoor scene.
6. Select construction mode, place valid houses/roads/shops on 3D tiles using the existing city builder rules and city funds, not the personal wallet.
7. Simulate a full day to drive existing city production, food consumption, population and fiscal flows. NPC positions update deterministically on roads.

## Trust boundaries and limits
All people, money, work, buildings and coordinates are fictional. No Supabase, payments, authentication writes, real parcel or contract modifications. Save key haroolife.lome-life.v1 is isolated in localStorage.
While the 3D scene is interactable, real-time continuous pedestrian path-following, collision physics, vehicle AI, mature indoor furniture interactions, and exact Lomé cadastral geography are not implemented. City traffic is an illustrative simulation. PlayCanvas works in WebGL2 browsers.

## Local-only verification, without deployment
Run: node --import tsx --test tests/haroolife-lome-life.test.ts
Run: npm run test:hardening && npm run typecheck && npm run build
Run: npx playwright test --config=e2e/lome-life-playwright.config.ts
Dedicated GitHub Actions workflow tests desktop Chromium and an Android-sized Pixel 7 device emulation with a localhost development server; screenshots stored as an artifact. This is not a physical-device FPS verification. Obtain real Android and desktop visual sign-off before merge.

## Next steps
Improve camera tracking and touch path interpolation, expand indoor geometry, implement road-following vehicle trips with capacity/traffic, introduce NPC daily schedules and performance limits for mobile GPU.