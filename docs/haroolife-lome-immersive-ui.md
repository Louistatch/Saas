# Lomé Life 3D — immersive mobile gameplay (original interface)

## Goal

Adapt the **existing** PlayCanvas, Next.js/TypeScript and Kenney-asset HarooLife module to mobile-first fullscreen immersive 3D. Interface behavior is informed by the user-provided screenshots of Lagos Life (fullscreen world + status ribbon + contextual bottom sheets + bottom navigation), but **no Lagos Life code, textures, logos, names, text or other proprietary assets are included**. No imitation of their real players, chat messages or online counters.

## Code changes

- `/haroolife/territoire/lome` now renders `LomeLifeImmersive`, not a dashboard. The PlayCanvas 3D canvas stays mounted in the background and covers the entire browser viewport. A top status bar shows the in-game day, needs and **fictional FCFA** wallet.
- Bottom navigation: Maison, Acheter, Carte, Téléphone. Reusable overlays add real actions to needs, shops, careers, location routing, construction, diary, and missions. Phone contains a fully local, rule-based fictional NPC chat with no network calls or real-user impersonation.
- Tour map: select a destination, then walk automatically through the connected road graph. Simulated motorcycle and taxi modes pay a one-time fictional fare (not controlled physical vehicles).
- Engine `walkLifeStep` moves one connected cell each animation tick without advancing an hour for each cell; road validation prevents teleportation onto deleted roads. Auto-navigation stops in background tabs.
- PlayCanvas interior cutaway scene for accessible buildings. New original geometry with **8 Kenney CC0 GLB furniture pieces** (bed, sofa, fridge, stove, tables, chairs, TV, plant). No proprietary interior layouts reused.
- Outdoor scene now displays locally vendored Kenney taxis, sedans, van, road lights and street signs. **Cars are still illustrative and updated via city simulation ticks; not a vehicle physics or traffic solver**.
- Existing city-builder construction/demolition, needs, wages, food stock and salary settlement are unchanged. All virtual funds remain separate from real FaitiereHub business accounts and operations. The saved game key `haroolife.lome-life.v1` remains compatible with previous builds.

## Attribution

All additional assets from https://github.com/Hidencod/tge-assets (Kenney collections), CC0. Source furniture-kit (8), car-kit (3), city-kit-roads (2). The upstream collection's license is CC0. Files are local under `public/haroolife/vendor/kenney-3d`. Existing MIT Cimulity, house builder and SimCity module notices remain documented in `lib/haroolife/vendor/`.

## Risks and remaining scope

This is **phase one**, not a full online The Sims/Lagos Life clone. The game has no real multiplayer, mobile money wallet, precise Lomé street map, online players, persistence across devices, streaming zones, narrated story system or AI NPC dialogue. Physical-device FPS, battery and thermal behavior require human QA. No deployment, branch merge or production database change is required for this PR.

## Regression checks

`npm run test:hardening` now tests interactive auto-routing, one-time fares, food, wage and day change invariants. `e2e/lome-life.spec.ts` exercises full-screen canvas, mobile bottom navigation, visiting the market, buying a meal, working and collecting salary, entering an interior and opening construction mode, capturing desktop and mobile-viewport screenshots with Playwright in local production mode on GitHub Actions.
