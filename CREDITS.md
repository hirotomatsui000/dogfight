# Credits

Contested Skies uses these free-license assets and the owner's own aircraft models. The files live in
`src/client/assets/`; `tools/fetch-assets.ts` records exactly how each photo was obtained, and
`tools/prepare-models.ts` how each model was processed.

| Asset | Source | Author | License |
|---|---|---|---|
| Satellite images `sat-farmland.jpg`, `sat-forest.jpg`, `sat-mountain.jpg` (Sentinel-2 cloudless 2017) | https://s2maps.eu | EOX IT Services GmbH | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) |
| Close-up ground detail `detail-grass-rock.jpg` ("Aerial Grass Rock") | https://polyhaven.com/a/aerial_grass_rock | Rob Tuytel | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) |
| Water normal map `waternormals.jpg` | https://github.com/mrdoob/three.js (`examples/textures`, r186) | three.js authors | [MIT](https://github.com/mrdoob/three.js/blob/dev/LICENSE) |
| Aircraft models `models/shade.glb` (F-35A-inspired, flown as the Shade) and `models/prizrak.glb` (Su-57-inspired, flown as the Prizrak), simplified, re-oriented and with resized textures by `tools/prepare-models.ts` | Generated with Tripo (https://www.tripo3d.ai) | Hiroto Matsui (project owner) | The owner's generated models; Tripo's terms of service apply |
| three.js library | https://threejs.org | three.js authors | MIT |
| Display font Rajdhani (Latin subset, weights 600 and 700), bundled from the `@fontsource/rajdhani` package | https://fonts.google.com/specimen/Rajdhani | Indian Type Foundry | [SIL Open Font License 1.1](https://openfontlicense.org) (full text: `node_modules/@fontsource/rajdhani/LICENSE`) |

Satellite imagery attribution, as required by CC BY 4.0:

> Sentinel-2 cloudless – https://s2maps.eu by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2017)

The satellite images are unmodified exports of three areas: farmland near Hrubieszów (Lublin Upland), Puszcza Notecka
forest, and the High Tatras. They are used only as tiled surface textures on the game's fictional map.
