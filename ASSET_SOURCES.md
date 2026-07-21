# Asset Sources

This project uses NASA imagery for Earth, the Moon, and a multiwavelength view of the Milky Way center. The files are vendored at web-friendly resolutions so the experience does not depend on third-party servers at runtime. Where practical, original NASA URLs remain configured as a secondary fallback, followed by procedural textures.

## NASA Textures

| Asset | Use | Source page | Local file |
|---|---|---|---|
| Blue Marble Next Generation, January, topography + bathymetry | Main Earth color texture and small Earth in the solar-system layer | https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ | `assets/nasa/earth-blue-marble-2048.jpg` |
| Blue Marble Clouds | Earth cloud color/alpha layer | https://visibleearth.nasa.gov/images/57747/blue-marble-clouds | `assets/nasa/earth-clouds-2048.jpg` |
| CGI Moon Kit, LROC color map | Moon texture in the Earth-Moon and solar-system layers | https://svs.gsfc.nasa.gov/4720/ | `assets/nasa/moon-lroc-color-2048.jpg` |
| Black Marble 2012 | Night-side Earth and city-light layer | https://earthobservatory.nasa.gov/images/79765/night-lights-2012-map | `assets/nasa/earth-black-marble-3600.jpg` |
| Milky Way center, Great Observatories multiwavelength composite (PIA12348) | Subtle transition backdrop between the solar-system and external-galaxy views | https://images.nasa.gov/details/PIA12348 | `assets/nasa/milky-way-center-multiwavelength.jpg` |
| TESS two-year all-sky panorama, NASA SVS 13726 | Research/reference asset for sky distribution and Milky Way context; not loaded by the runtime scene | https://svs.gsfc.nasa.gov/13726/ | `assets/nasa/milky-way-tess-2160.jpg` |

## Milky Way Structure References

The 3D galaxies are procedural visualizations, not direct NASA images and not strict physical simulations. Their structure and copy were informed by:

- NASA SVS 14935, **Milky Way Anatomy**: https://svs.gsfc.nasa.gov/14935/
- NASA SVS 15047, **The Milky Way's Habitable Zone**: https://svs.gsfc.nasa.gov/15047/
- NASA/JPL-Caltech Spitzer **GLIMPSE 360** panorama: https://svs.gsfc.nasa.gov/30560/
- NASA Great Observatories Milky Way center composite, image PIA12348: https://images.nasa.gov/details/PIA12348

The Milky Way layer uses a central bar/bulge, four major spiral-arm traces, a thin disk, and a sparse stellar halo. The Local Group layout includes the Milky Way, Andromeda (M31), Triangulum (M33), and the Large and Small Magellanic Clouds. Distances are presented as an intentionally compressed, experience-led view.

## Usage Notes

NASA generally makes its imagery available for public use, but individual assets should still be credited and checked before redistribution. Keep this source record alongside the files. No NASA endorsement is implied.

## Runtime Library

Three.js `0.165.0` is vendored as `vendor/three.module.js` under the MIT License. The upstream license text is preserved as `vendor/three.LICENSE.txt`.
