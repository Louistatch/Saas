# Third-party attribution — HarooLife Lomé Life

Both upstream projects are MIT-licensed. Their actual license notices are reproduced below. Only explicitly documented, compatible portions are reused.

## ch-bas/threejs-sims-house-builder

Source: https://github.com/ch-bas/threejs-sims-house-builder

Vendored module: `lib/haroolife/vendor/house-builder-camera-zoom.ts` (original `components/room-organizer/lib/camera-zoom.ts`). Used to control the existing PlayCanvas camera; **no Three.js runtime was added**.

MIT License

Copyright (c) 2026 Bassem Chagra

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## dgreenheck/simcity-threejs-clone

Source: https://github.com/dgreenheck/simcity-threejs-clone

Adapted module: `lib/haroolife/vendor/simcity-road-path.ts`. A pure TypeScript BFS route planner based on `src/scripts/sim/city.js` neighbor search, decoupled from Three.js. No public textures or model assets have been copied.

MIT License

Copyright (c) 2023 Daniel Greenheck

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.


## silverlion2/simlife

Source: https://github.com/silverlion2/simlife

**No code or assets copied.** As inspected 2026-10-11, its README says MIT but `package.json` specifies ISC and there is no root LICENSE. Dependencies include Phaser 4, Rex plugins, Electron 41 and custom script-global `window.Game` APIs. Ideas (needs, autonomy, careers) informed original implementation only; licensing needs clarification before incorporating source.

## Previously vendored assets

Original HarooLife base already includes Kenney 3D assets (CC0) and a Cimulity MIT road classification utility. Their previous attribution files remain intact.
