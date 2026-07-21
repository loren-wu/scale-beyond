# Asset Sources

This project uses NASA imagery for its Earth, cloud, and Moon textures. The files are vendored at a web-friendly 2K resolution so the experience does not depend on third-party servers at runtime. The original NASA URLs remain configured as a secondary fallback, followed by procedural textures.

## NASA Textures

| Asset | Use | Source page | Local file |
|---|---|---|---|
| Blue Marble Next Generation, January, topography + bathymetry | Main Earth color texture and small Earth in the solar-system layer | https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ | `assets/nasa/earth-blue-marble-2048.jpg` |
| Blue Marble Clouds | Earth cloud color/alpha layer | https://visibleearth.nasa.gov/images/57747/blue-marble-clouds | `assets/nasa/earth-clouds-2048.jpg` |
| CGI Moon Kit, LROC color map | Moon texture in the Earth-Moon and solar-system layers | https://svs.gsfc.nasa.gov/4720/ | `assets/nasa/moon-lroc-color-2048.jpg` |

## Usage Notes

NASA generally makes its imagery available for public use, but individual assets should still be credited and checked before redistribution. Keep this source record alongside the files. No NASA endorsement is implied.

## Runtime Library

Three.js `0.165.0` is vendored as `vendor/three.module.js` under the MIT License. The upstream license text is preserved as `vendor/three.LICENSE.txt`.
