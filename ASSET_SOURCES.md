# Asset Sources

This project uses NASA imagery for Earth, the Moon, and the Milky Way plane. Core scene files are vendored at web-friendly resolutions, so the complete seven-stage journey remains available without third-party runtime access. An optional NASA GIBS request adds the latest usable daily Earth observation; where practical, official URLs and procedural textures remain configured as safe fallbacks.

## NASA Textures

| Asset | Use | Source page | Local file |
|---|---|---|---|
| Blue Marble Next Generation, January, topography + bathymetry | Main static Earth surface; 5400×2700 on desktop and 2048×1024 on compact screens | https://science.nasa.gov/earth/earth-observatory/blue-marble-next-generation/ | `assets/nasa/earth-blue-marble-5400.jpg`, `assets/nasa/earth-blue-marble-2048.jpg` |
| NASA GIBS Corrected Reflectance True Color | Optional near-real-time daily Earth surface with observed clouds; queried through WMS at runtime | https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs | Runtime WMS: `https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi` |
| Blue Marble Clouds | Earth cloud color/alpha layer | https://visibleearth.nasa.gov/images/57747/blue-marble-clouds | `assets/nasa/earth-clouds-2048.jpg` |
| CGI Moon Kit, LROC color map | Moon texture in the Earth-Moon and solar-system layers | https://svs.gsfc.nasa.gov/4720/ | `assets/nasa/moon-lroc-color-2048.jpg` |
| Black Marble 2012 | Night-side Earth and city-light layer | https://earthobservatory.nasa.gov/images/79765/night-lights-2012-map | `assets/nasa/earth-black-marble-3600.jpg` |
| Spitzer GLIMPSE 360, 360-degree Milky Way plane survey | Infrared observation layer between the visible-sky band and the external-galaxy view; stitched from six official longitude panels | https://www.spitzer.caltech.edu/image/ssc2014-02a-glimpse-the-galaxy-all-the-way-around | `assets/nasa/milky-way-glimpse360-4096.webp` |
| Milky Way center, Great Observatories multiwavelength composite (PIA12348) | Research/reference asset for the Galactic Center and multiwavelength color language; retained locally but not loaded by the current runtime scene | https://images.nasa.gov/details/PIA12348 | `assets/nasa/milky-way-center-multiwavelength.jpg` |
| TESS two-year all-sky panorama, NASA SVS 13726 | Research/reference asset for sky distribution and Milky Way context; not loaded by the runtime scene | https://svs.gsfc.nasa.gov/13726/ | `assets/nasa/milky-way-tess-2160.jpg` |

The GLIMPSE 360 runtime panorama is credited to **NASA/JPL-Caltech/GLIMPSE Team**. Six 3000 × 500 public survey panels were joined in Galactic-longitude order and resized to a 4096 × 114 WebP without cropping the coverage gaps. In the Solar System sky band it is sampled only on desktop, desaturated, and mixed at `0.085`; compact mode keeps the authored visible-light panorama without downloading this secondary structure layer.

### Near-real-time Earth notes

- Current UTC sunlight and the daily satellite mosaic use two independent clocks. The terminator is recalculated continuously; the surface observation is the newest usable daily image and is not a live camera feed.
- Desktop uses an adaptive `balanced` / `high` budget: 2048×1024 on ordinary displays or 4096×2048 on capable high-density hardware. Balanced mode tries Suomi NPP and NOAA-20; high mode can additionally fall back to MODIS Terra. Compact mode requests 1024×512 and limits the live layer to Suomi NPP.
- GIBS daily swaths can contain black no-data wedges. A luminance coverage mask in the Earth shader lets the static Blue Marble remain visible through those gaps.
- If CORS, network, timeout, image validation, or availability checks fail, the experience retains the local Blue Marble and real-time solar geometry.

## Original Visible-Sky Artwork

| Asset | Use | Design basis | Local file |
|---|---|---|---|
| Visible-light Milky Way sky band | Camera-surrounding night-sky band during the Solar System stage | Original generated artwork constrained by NASA Milky Way structure references, with a central dust rift, warm Galactic Center, cool stellar clouds, and no horizon or labels | `assets/cosmic/milky-way-sky-band-v1.jpg` |

The visible-sky band is **not a NASA photograph**. It is deliberately documented and identified in the interface as original sky artwork; NASA data appears separately in the Earth, Moon, and Spitzer observation layers.

## Milky Way Structure References

The 3D galaxies are procedural visualizations, not direct NASA images and not strict physical simulations. Their structure and copy were informed by:

- NASA SVS 14935, **Milky Way Anatomy**: https://svs.gsfc.nasa.gov/14935/
- NASA SVS 15047, **The Milky Way's Habitable Zone**: https://svs.gsfc.nasa.gov/15047/
- NASA/JPL-Caltech Spitzer **GLIMPSE 360** panorama: https://www.spitzer.caltech.edu/image/ssc2014-02a-glimpse-the-galaxy-all-the-way-around
- NASA Great Observatories Milky Way center composite, image PIA12348: https://images.nasa.gov/details/PIA12348

The Milky Way layer uses a central bar/bulge, four unequal primary spiral-arm traces with independent phase and pitch, fragmented arm envelopes, feather-like spurs, dust attenuation in both the point population and diffuse shader, an S-warped/flared outer disk, thin and thick disks, a stellar halo, and a procedural population of globular clusters. The Local Group layout distinguishes the morphology of the Milky Way, Andromeda (M31), Triangulum (M33), and the Large and Small Magellanic Clouds; it also includes 18 named dwarf companions spanning compact elliptical, dwarf spheroidal, irregular, and ultra-diffuse forms. A single-draw shader field adds distant elliptical, disk, dusty edge-on, and irregular profiles for depth. Distances, sizes, surface brightness, and galaxy counts are intentionally compressed for the experience and are not a survey-complete simulation.

## Usage Notes

NASA generally makes its imagery available for public use, but individual assets should still be credited and checked before redistribution. Keep this source record alongside the files. No NASA endorsement is implied.

## Runtime Library

Three.js `0.165.0` is vendored as `vendor/three.module.js` under the MIT License. The upstream license text is preserved as `vendor/three.LICENSE.txt`.
