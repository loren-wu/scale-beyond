import * as THREE from 'three';
import { createPlanetTexture, createRingMaterial, createSunTexture } from './src/planet-textures.js?v=scale-cosmic6';
import { createCosmicEnvironment } from './src/galaxy.js?v=scale-cosmic6';
import { createSkyBand } from './src/sky-band.js?v=scale-cosmic6';
import { createCosmicControls } from './src/controls.js?v=scale-cosmic6';
import { createLiveEarthController, LIVE_EARTH_SHADER_CHUNK } from './src/live-earth.js?v=scale-cosmic6';

const container = document.getElementById('scene');
const experience = document.querySelector('.experience');
const layerName = document.getElementById('layerName');
const scaleUnit = document.getElementById('scaleUnit');
const captionZh = document.getElementById('captionZh');
const captionEn = document.getElementById('captionEn');
const stageFacts = [...document.querySelectorAll('#stageFacts span')];
const stageStatus = document.getElementById('stageStatus');
const meterTicks = [...document.querySelectorAll('.meter-tick')];
const hint = document.getElementById('hint');
const scaleBar = document.getElementById('scaleBar');
const distanceValue = document.getElementById('distanceValue');
const assetStatus = document.getElementById('assetStatus');
const earthRealtimeStatus = document.getElementById('earthRealtimeStatus');
const locationMarker = document.getElementById('locationMarker');

const EARTH_RADIUS = 8;
const MAX_SCALE = 1800;
const compactMode = window.innerWidth < 760;
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = motionQuery.matches;

const TEXTURE_SOURCES = {
  earth: compactMode
    ? [
        'assets/nasa/earth-blue-marble-2048.jpg',
        'https://assets.science.nasa.gov/dynamicimage/assets/science/esd/eo/images/bmng/bmng-topography-bathymetry/january/world.topo.bathy.200401.3x5400x2700.jpg?w=2048&h=1024&fit=clip&crop=faces%2Cfocalpoint'
      ]
    : [
        'assets/nasa/earth-blue-marble-5400.jpg',
        'assets/nasa/earth-blue-marble-2048.jpg',
        'https://assets.science.nasa.gov/dynamicimage/assets/science/esd/eo/images/bmng/bmng-topography-bathymetry/january/world.topo.bathy.200401.3x5400x2700.jpg?w=5400&h=2700&fit=clip&crop=faces%2Cfocalpoint'
      ],
  clouds: [
    'assets/nasa/earth-clouds-2048.jpg',
    'https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg'
  ],
  moon: [
    'assets/nasa/moon-lroc-color-2048.jpg',
    'https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/lroc_color_2k.jpg'
  ],
  earthNight: [
    'assets/nasa/earth-black-marble-3600.jpg',
    'https://eoimages.gsfc.nasa.gov/images/imagerecords/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg'
  ],
  milkyWayCenter: [
    'assets/nasa/milky-way-center-multiwavelength.jpg',
    'https://images-assets.nasa.gov/image/PIA12348/PIA12348~large.jpg'
  ],
  milkyWayPanorama: [
    'assets/nasa/milky-way-glimpse360-4096.webp'
  ]
};

const textureState = {
  pending: 0,
  loadedLocal: 0,
  loadedRemote: 0,
  fallback: 0
};

const state = {
  scale: 18,
  targetScale: 18,
  zoomVelocity: 0,
  orbitYaw: 0,
  orbitPitch: 0,
  interacted: false
};

let milkyWaySkyBand = null;

function targetPixelRatio() {
  const memory = Number(navigator.deviceMemory) || 8;
  const qualityCap = compactMode || memory <= 4 ? 1.5 : 2;
  return Math.min(window.devicePixelRatio || 1, qualityCap);
}

if (window.matchMedia('(pointer: coarse)').matches) {
  const [zoomHint, dragHint] = hint.querySelectorAll('span');
  zoomHint.textContent = '双指缩放';
  dragHint.textContent = '单指抓住旋转';
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02050d, 0.00082);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 12000);
camera.position.set(0, 2, 16);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(targetPixelRatio());
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x01040c, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.18;
container.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const world = new THREE.Group();
const planetGroup = new THREE.Group();
const solarGroup = new THREE.Group();
const cosmicGroup = new THREE.Group();
scene.add(world, planetGroup, solarGroup, cosmicGroup, camera);

const sunDirection = new THREE.Vector3(-18, 4, 4).normalize();
const sunLight = new THREE.DirectionalLight(0xffffff, 4.6);
sunLight.position.copy(sunDirection).multiplyScalar(42);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x9dbbe5, 0.09));

const textureAnisotropy = renderer.capabilities.getMaxAnisotropy();
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

const earth = createEarth();
const clouds = createClouds();
const atmosphere = createAtmosphere();
const aurora = createAurora();
const moonSystem = createMoonSystem();
planetGroup.add(earth, clouds, atmosphere, aurora, moonSystem.root);

let liveEarthMixTarget = 0;
let liveEarthSnapshot = null;
const liveEarthController = createLiveEarthController({
  renderer,
  compact: compactMode,
  quality: compactMode ? 'constrained' : 'auto',
  earthObject: earth,
  sunLight,
  sunDirectionTargets: [
    sunDirection,
    earth.material.uniforms.sunDirection,
    atmosphere.material.uniforms.sunDirection,
    aurora.material.uniforms.sunDirection
  ],
  applyTexture(texture) {
    earth.material.uniforms.liveMap.value = texture;
    liveEarthMixTarget = compactMode ? 0.38 : 0.52;
    return true;
  }
});
liveEarthController.subscribe((snapshot) => {
  liveEarthSnapshot = snapshot;
  if (!earthRealtimeStatus) return;
  earthRealtimeStatus.dataset.state = snapshot.phase;
  if (snapshot.phase === 'ready' || snapshot.phase === 'stale') {
    const availability = snapshot.phase === 'stale' ? '最近可用卫星影像' : '近实时卫星影像';
    earthRealtimeStatus.textContent = `实时昼夜 · NASA GIBS ${availability} · ${snapshot.date} UTC`;
  } else if (snapshot.phase === 'loading') {
    earthRealtimeStatus.textContent = '实时昼夜 · NASA GIBS 卫星影像匹配中';
  } else {
    earthRealtimeStatus.textContent = `实时昼夜 · STATIC BLUE MARBLE ${compactMode ? '2048PX' : '5400PX'}`;
    if (snapshot.phase === 'fallback') liveEarthMixTarget = 0;
  }
});
liveEarthController.start();

// Begin near the real subsolar hemisphere instead of leaving the first frame
// at an arbitrary longitude. The offset keeps a readable terminator in view.
const initialSolarDirection = liveEarthController.getSolarFrame().localDirection;
const initialSolarBearing = Math.atan2(initialSolarDirection.x, initialSolarDirection.z);
const earthPresentationRotation = -0.28 - initialSolarBearing - 0.72;
earth.rotation.y = earthPresentationRotation;
clouds.rotation.y = earthPresentationRotation + 0.018;

const starField = createStarField();
const galaxyGlow = createGalaxyGlow();
const deepSpaceVeil = createDeepSpaceVeil();
world.add(starField, galaxyGlow, deepSpaceVeil);

const solarSystem = createSolarSystem();
solarGroup.add(solarSystem.root);

const cosmicEnvironment = createCosmicEnvironment(compactMode);
cosmicGroup.add(cosmicEnvironment.root);

milkyWaySkyBand = createSkyBand({
  compact: compactMode,
  anisotropy: Math.min(textureAnisotropy, 4),
  onError: () => {
    assetStatus.textContent = 'NASA DATA · MILKY WAY SKY ART UNAVAILABLE';
  }
});
milkyWaySkyBand.setMotionEnabled(!reduceMotion);
scene.add(milkyWaySkyBand.root);

const controlsFrame = {};
const controls = createCosmicControls({
  element: renderer.domElement,
  initialScale: state.scale,
  minScale: 0,
  maxScale: MAX_SCALE,
  homeScale: 18,
  motionQuery,
  dragSensitivity: compactMode ? 0.0029 : 0.0027,
  touchDragMultiplier: 1.04,
  zoomDamping: 12,
  zoomResponse: 11.2,
  orbitDamping: 7.2,
  onInteract: markInteracted,
  onDragChange: (active) => document.body.classList.toggle('is-dragging', active),
  onReducedMotionChange: (value) => {
    reduceMotion = value;
    milkyWaySkyBand.setMotionEnabled(!value);
  }
});

const nasaBackdrop = createNasaBackdrop();
camera.add(nasaBackdrop);

const targetLookAt = new THREE.Vector3();
const currentLookAt = new THREE.Vector3();
const targetPosition = new THREE.Vector3();
const currentPosition = new THREE.Vector3().copy(camera.position);
const cameraSolarCenter = new THREE.Vector3();
const cameraGalaxyCenter = new THREE.Vector3(0, 0, -60);
const cameraLocalCenter = new THREE.Vector3(20, -18, -78);
const transitionRig = {
  scale: state.scale,
  velocity: 0,
  motion: 0,
  direction: 0
};

let galaxyOpacity = 0;
let localGroupOpacity = 0;

const copy = [
  {
    max: 70,
    layer: '01 · NEAR-EARTH ORBIT',
    unit: '120–2,000 KM ABOVE EARTH',
    zh: '在离地数百公里的轨道上，云层、海洋与城市灯光仍覆盖整个视野；大气只是一圈极薄的蓝色边缘。',
    en: 'From near-Earth orbit, the atmosphere is only a thin blue edge around our world.',
    facts: ['KÁRMÁN LINE · 100 KM', 'LOW ORBIT · ≈90 MIN', 'BLUE EDGE · <1% RADIUS']
  },
  {
    max: 190,
    layer: '02 · EARTH IN VIEW',
    unit: 'DIAMETER · 12,742 KM',
    zh: '昼面反射太阳光，夜面显露人类灯火，昼夜交界线沿着自转缓慢移动。',
    en: 'Sunlight, city lights and the moving terminator reveal a living planet.',
    facts: ['OCEAN · 71%', 'ROTATION · 23 H 56 M', 'ONE HOME · 12,742 KM']
  },
  {
    max: 380,
    layer: '03 · EARTH–MOON SYSTEM',
    unit: 'MEAN DISTANCE · 384,400 KM',
    zh: '地月平均相距 384,400 公里——这段空隙足以并排放下约 30 个地球。',
    en: 'The gap between Earth and Moon is wide enough for about thirty Earths.',
    facts: ['MEAN DISTANCE · 384,400 KM', 'ORBIT · 27.3 DAYS', 'GAP · ≈30 EARTHS']
  },
  {
    max: 800,
    layer: '04 · SOLAR SYSTEM',
    unit: 'NEPTUNE ORBIT · 30 AU',
    zh: '八颗行星共享近乎平坦的轨道盘。更远处，银河盘中无数恒星的光汇成一道横贯天空的星带。',
    en: 'Eight planets orbit the Sun beneath the luminous band of the Milky Way.',
    facts: ['8 PLANETS', '5 DWARF PLANETS', '30 AU TO NEPTUNE']
  },
  {
    max: 1050,
    layer: '05 · STELLAR NEIGHBORHOOD',
    unit: 'NEAREST STAR · 4.24 LIGHT-YEARS',
    zh: '越过日球层，太阳也只是一颗普通恒星；银河的光带开始显露我们所在星系的轮廓。',
    en: 'Beyond the heliosphere, the Sun becomes one star inside the galactic disk.',
    facts: ['HELIOPAUSE · ≈120 AU', 'PROXIMA · 4.24 LY', 'LOCAL BUBBLE · ≈1,000 LY']
  },
  {
    max: 1450,
    layer: '06 · MILKY WAY',
    unit: 'DIAMETER · ≈100,000 LIGHT-YEARS',
    zh: '银河系是一座棒旋星系。太阳位于猎户支臂，距银河中心约 26,000 光年。',
    en: 'The Sun sits on the Orion Spur, far from the Milky Way’s central bar.',
    facts: ['4 PRIMARY ARMS', '≈100–400 BILLION STARS', '26,000 LY FROM CENTER']
  },
  {
    max: MAX_SCALE + 1,
    layer: '07 · LOCAL GROUP',
    unit: 'SPAN · ≈10 MILLION LIGHT-YEARS',
    zh: '银河系、仙女座、三角座和数十个矮星系共同组成了本星系群，引力把它们联结成一个家族。',
    en: 'The Milky Way is one member of a gravitational family of galaxies.',
    facts: ['50+ GALAXIES', 'M31 · 2.5 MLY', '≈10 MLY WIDE']
  }
];

let activeStageIndex = -1;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mix(a, b, amount) {
  return a + (b - a) * amount;
}

function smoothstep(edge0, edge1, value) {
  const normalized = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return normalized * normalized * (3 - 2 * normalized);
}

function smootherstep(edge0, edge1, value) {
  const normalized = clamp((value - edge0) / Math.max(edge1 - edge0, 0.0001), 0, 1);
  return normalized * normalized * normalized * (normalized * (normalized * 6 - 15) + 10);
}

function damp(value, target, response, delta) {
  return mix(value, target, 1 - Math.exp(-response * delta));
}

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCanvasTexture(size, painter) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size / 2;
  const context = canvas.getContext('2d');
  painter(context, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = textureAnisotropy;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function configureTexture(texture) {
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = textureAnisotropy;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return texture;
}

function refreshAssetStatus() {
  if (textureState.pending > 0) return;

  const localOnly = textureState.loadedLocal > 0 && textureState.loadedRemote === 0 && textureState.fallback === 0;
  if (localOnly) {
    assetStatus.textContent = 'NASA DATA · ORIGINAL VISIBLE-SKY ART';
  } else if (textureState.fallback > 0) {
    assetStatus.textContent = 'NASA DATA PARTIAL · ORIGINAL VISIBLE-SKY ART';
  } else {
    assetStatus.textContent = 'NASA DATA · ORIGINAL VISIBLE-SKY ART';
  }
  assetStatus.classList.add('is-ready');
}

function loadTexture(sources, label, onLoad) {
  textureState.pending += 1;

  const attempt = (sourceIndex) => {
    textureLoader.load(
      sources[sourceIndex],
      (texture) => {
        configureTexture(texture);
        onLoad(texture);
        textureState.pending -= 1;
        if (sourceIndex === 0) textureState.loadedLocal += 1;
        else textureState.loadedRemote += 1;
        refreshAssetStatus();
      },
      undefined,
      () => {
        if (sourceIndex + 1 < sources.length) {
          attempt(sourceIndex + 1);
          return;
        }
        textureState.pending -= 1;
        textureState.fallback += 1;
        console.warn(`Texture failed to load, keeping procedural fallback: ${label}`);
        refreshAssetStatus();
      }
    );
  };

  attempt(0);
}

function applyTexture(material, sources, label, options = {}) {
  loadTexture(sources, label, (texture) => {
    const previousMap = material.map;
    material.map = texture;
    if (options.useAsAlphaMap) material.alphaMap = texture;
    material.needsUpdate = true;
    if (previousMap?.isCanvasTexture) previousMap.dispose();
  });
}

function createEarthTexture() {
  return makeCanvasTexture(compactMode ? 1024 : 2048, (context, width, height) => {
    const random = seededRandom(92841);
    const ocean = context.createLinearGradient(0, 0, width, height);
    ocean.addColorStop(0, '#0b2f57');
    ocean.addColorStop(0.44, '#123f69');
    ocean.addColorStop(1, '#07182e');
    context.fillStyle = ocean;
    context.fillRect(0, 0, width, height);

    const landColors = ['#3d6f52', '#5f7f55', '#8a805d', '#c6b885', '#314f3f'];
    for (let index = 0; index < 42; index += 1) {
      const x = random() * width;
      const y = height * (0.16 + random() * 0.68);
      const radiusX = width * (0.035 + random() * 0.12);
      const radiusY = height * (0.025 + random() * 0.12);
      context.save();
      context.translate(x, y);
      context.rotate((random() - 0.5) * 1.4);
      context.beginPath();
      context.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
      context.fillStyle = landColors[Math.floor(random() * landColors.length)];
      context.globalAlpha = 0.5 + random() * 0.38;
      context.fill();
      context.restore();
    }

    context.globalAlpha = 0.75;
    context.fillStyle = '#d8e1df';
    context.fillRect(0, 0, width, height * 0.07);
    context.fillRect(0, height * 0.93, width, height * 0.07);
    context.globalAlpha = 1;
  });
}

function createEarthNightTexture() {
  return makeCanvasTexture(compactMode ? 1024 : 2048, (context, width, height) => {
    const random = seededRandom(381991);
    context.fillStyle = '#01040a';
    context.fillRect(0, 0, width, height);
    context.globalCompositeOperation = 'screen';
    for (let index = 0; index < 950; index += 1) {
      const latitudeBias = Math.pow(random(), 0.76);
      const hemisphere = random() > 0.5 ? 1 : -1;
      const x = random() * width;
      const y = height * (0.5 + hemisphere * latitudeBias * 0.32);
      const radius = 0.3 + random() * 2.2;
      context.globalAlpha = 0.08 + random() * 0.5;
      context.fillStyle = random() > 0.12 ? '#ffca75' : '#9cc9ff';
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    context.globalCompositeOperation = 'source-over';
  });
}

function createCloudTexture() {
  return makeCanvasTexture(compactMode ? 768 : 1536, (context, width, height) => {
    const random = seededRandom(57429);
    context.clearRect(0, 0, width, height);
    for (let index = 0; index < 240; index += 1) {
      const x = random() * width;
      const y = random() * height;
      const length = width * (0.025 + random() * 0.09);
      const alpha = 0.08 + random() * 0.28;
      const gradient = context.createRadialGradient(x, y, 0, x, y, length);
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      context.fillStyle = gradient;
      context.beginPath();
      context.ellipse(x, y, length, length * (0.16 + random() * 0.28), (random() - 0.5) * 1.2, 0, Math.PI * 2);
      context.fill();
    }
  });
}

function createEarth() {
  const dayTexture = createEarthTexture();
  const nightTexture = createEarthNightTexture();
  const material = new THREE.ShaderMaterial({
    transparent: true,
    uniforms: {
      dayMap: { value: dayTexture },
      liveMap: { value: dayTexture },
      nightMap: { value: nightTexture },
      sunDirection: { value: sunDirection.clone() },
      dayTexelSize: { value: new THREE.Vector2(1 / dayTexture.image.width, 1 / dayTexture.image.height) },
      liveMix: { value: 0 },
      surfaceDetail: { value: compactMode ? 0.24 : 0.7 },
      opacity: { value: 1 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;

      void main() {
        vUv = uv;
        vViewNormal = normalize(normalMatrix * normal);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D dayMap;
      uniform sampler2D liveMap;
      uniform sampler2D nightMap;
      uniform vec3 sunDirection;
      uniform vec2 dayTexelSize;
      uniform float liveMix;
      uniform float surfaceDetail;
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;

      ${LIVE_EARTH_SHADER_CHUNK}

      void main() {
        vec3 normal = normalize(vViewNormal);
        vec3 lightDirection = normalize((viewMatrix * vec4(sunDirection, 0.0)).xyz);
        vec3 viewDirection = normalize(-vViewPosition);
        float sunAmount = dot(normal, lightDirection);
        float dayBlend = smoothstep(-0.1, 0.16, sunAmount);
        float daylight = 0.24 + max(sunAmount, 0.0) * 1.06;
        vec3 staticDay = texture2D(dayMap, vUv).rgb;
        vec3 neighborAverage = (
          texture2D(dayMap, vUv + vec2(dayTexelSize.x, 0.0)).rgb
          + texture2D(dayMap, vUv - vec2(dayTexelSize.x, 0.0)).rgb
          + texture2D(dayMap, vUv + vec2(0.0, dayTexelSize.y)).rgb
          + texture2D(dayMap, vUv - vec2(0.0, dayTexelSize.y)).rgb
        ) * 0.25;
        staticDay = clamp(staticDay + (staticDay - neighborAverage) * surfaceDetail, 0.0, 1.24);
        vec3 liveDay = texture2D(liveMap, vUv).rgb;
        vec3 dayColor = blendLiveEarthSurface(staticDay, liveDay, liveMix);
        vec3 nightSample = texture2D(nightMap, vUv).rgb;
        float cityLight = smoothstep(0.028, 0.62, max(nightSample.r, max(nightSample.g, nightSample.b)));
        vec3 nightColor = nightSample * (2.45 + cityLight * 1.7);
        float oceanMask = smoothstep(0.035, 0.22, dayColor.b - max(dayColor.r, dayColor.g) * 0.72);
        vec3 reflected = reflect(-lightDirection, normal);
        float specular = pow(max(dot(reflected, viewDirection), 0.0), 72.0) * oceanMask * max(sunAmount, 0.0);
        float twilight = exp(-abs(sunAmount) * 24.0) * pow(1.0 - abs(dot(normal, viewDirection)), 1.4);
        float limb = pow(1.0 - max(dot(normal, viewDirection), 0.0), 2.4);
        vec3 shadowSurface = dayColor * 0.12 + nightColor;
        vec3 color = mix(shadowSurface, dayColor * daylight, dayBlend);
        color += vec3(0.42, 0.66, 1.0) * specular * 0.82;
        color += vec3(1.0, 0.25, 0.055) * twilight * 0.18;
        color += vec3(0.025, 0.075, 0.15) * limb * (0.35 + dayBlend * 0.65);
        gl_FragColor = vec4(color, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  loadTexture(TEXTURE_SOURCES.earth, 'Blue Marble Earth', (texture) => {
    const previous = material.uniforms.dayMap.value;
    material.uniforms.dayMap.value = texture;
    if (material.uniforms.liveMap.value === previous) material.uniforms.liveMap.value = texture;
    const width = texture.image?.naturalWidth || texture.image?.width || (compactMode ? 2048 : 5400);
    const height = texture.image?.naturalHeight || texture.image?.height || Math.round(width / 2);
    material.uniforms.dayTexelSize.value.set(1 / width, 1 / height);
    if (previous?.isCanvasTexture) previous.dispose();
  });
  loadTexture(TEXTURE_SOURCES.earthNight, 'Black Marble Earth at night', (texture) => {
    const previous = material.uniforms.nightMap.value;
    material.uniforms.nightMap.value = texture;
    if (previous?.isCanvasTexture) previous.dispose();
  });

  return new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS, compactMode ? 96 : 128, compactMode ? 64 : 96), material);
}

function createClouds() {
  const geometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.012, compactMode ? 96 : 128, compactMode ? 64 : 96);
  const material = new THREE.MeshStandardMaterial({
    map: createCloudTexture(),
    transparent: true,
    opacity: 0.58,
    alphaTest: 0.012,
    depthWrite: false,
    roughness: 0.96,
    color: 0xf4f8ff
  });
  applyTexture(material, TEXTURE_SOURCES.clouds, 'Blue Marble Clouds', { useAsAlphaMap: true });
  return new THREE.Mesh(geometry, material);
}

function createAtmosphere() {
  const geometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.06, compactMode ? 96 : 128, compactMode ? 64 : 96);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      sunDirection: { value: sunDirection.clone() },
      intensity: { value: 0.92 }
    },
    vertexShader: `
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 sunDirection;
      uniform float intensity;
      varying vec3 vWorldNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 normal = normalize(vWorldNormal);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float horizon = 1.0 - abs(dot(normal, viewDirection));
        float rayleigh = pow(horizon, 2.15);
        float outerHaze = pow(horizon, 5.2);
        float sunAmount = dot(normal, normalize(sunDirection));
        float daylight = smoothstep(-0.28, 0.42, sunAmount);
        float terminator = exp(-abs(sunAmount) * 18.0);
        float forwardScatter = pow(max(dot(viewDirection, -normalize(sunDirection)), 0.0), 7.0);
        vec3 color = mix(vec3(0.09, 0.28, 0.92), vec3(0.34, 0.72, 1.0), daylight);
        color += vec3(1.0, 0.2, 0.035) * terminator * 0.22;
        color += vec3(0.52, 0.72, 1.0) * forwardScatter * 0.16;
        float alpha = (rayleigh * 0.72 + outerHaze * 0.38) * intensity * (0.26 + daylight * 0.74);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  return new THREE.Mesh(geometry, material);
}

function createAurora() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      time: { value: 0 },
      intensity: { value: 0.64 },
      sunDirection: { value: sunDirection.clone() }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vWorldNormal;
      void main() {
        vUv = uv;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float time;
      uniform float intensity;
      uniform vec3 sunDirection;
      varying vec2 vUv;
      varying vec3 vWorldNormal;

      void main() {
        float latitude = abs(vUv.y - 0.5) * 2.0;
        float polarBand = smoothstep(0.52, 0.7, latitude) * (1.0 - smoothstep(0.86, 0.985, latitude));
        float waveA = 0.5 + 0.5 * sin(vUv.x * 72.0 + time * 0.7 + sin(vUv.x * 17.0) * 2.0);
        float waveB = 0.5 + 0.5 * sin(vUv.x * 133.0 - time * 0.42);
        float curtains = smoothstep(0.28, 0.94, waveA * 0.68 + waveB * 0.32);
        float night = 1.0 - smoothstep(-0.18, 0.42, dot(normalize(vWorldNormal), normalize(sunDirection)));
        vec3 color = mix(vec3(0.16, 1.0, 0.54), vec3(0.38, 0.68, 1.0), waveB);
        float alpha = polarBand * (0.16 + curtains * 0.84) * (0.3 + night * 0.7) * intensity;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
  return new THREE.Mesh(
    new THREE.SphereGeometry(EARTH_RADIUS * 1.028, compactMode ? 96 : 128, compactMode ? 64 : 96),
    material
  );
}

function createMoonSystem() {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    color: 0xc6c5be,
    roughness: 0.94,
    metalness: 0
  });
  applyTexture(material, TEXTURE_SOURCES.moon, 'LROC Moon');

  const moon = new THREE.Mesh(new THREE.SphereGeometry(EARTH_RADIUS * 0.273, 64, 48), material);
  moon.position.x = 42;
  pivot.rotation.z = -0.09;
  pivot.add(moon);

  const orbit = createOrbit(42, 0xbfc7cf);
  orbit.material.opacity = 0.16;
  orbit.userData.baseOpacity = 0.16;
  root.add(orbit, pivot);
  return { root, pivot, moon };
}

function createGalaxyGlow() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(512, 128, 4, 512, 128, 500);
  gradient.addColorStop(0, 'rgba(189, 208, 230, 0.28)');
  gradient.addColorStop(0.18, 'rgba(115, 142, 176, 0.14)');
  gradient.addColorStop(0.55, 'rgba(54, 72, 101, 0.045)');
  gradient.addColorStop(1, 'rgba(2, 4, 10, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    color: 0x93abc5,
    transparent: true,
    opacity: 0.18,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(-280, 110, -980);
  sprite.scale.set(1250, 310, 1);
  return sprite;
}

function createStarField() {
  const random = seededRandom(14793);
  const count = compactMode ? 5600 : 12800;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const phases = new Float32Array(count);
  const color = new THREE.Color();
  const spectralColors = [
    0x8fb8ff,
    0xb8d0ff,
    0xe8efff,
    0xfff3dc,
    0xffd6a4,
    0xffaa72
  ];

  for (let index = 0; index < count; index += 1) {
    const radius = 500 + Math.pow(random(), 0.72) * 1320;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    const spectralRoll = random();
    const paletteIndex = spectralRoll < 0.11
      ? 5
      : spectralRoll < 0.24
        ? 4
        : spectralRoll < 0.48
          ? 3
          : spectralRoll < 0.72
            ? 2
            : spectralRoll < 0.9
              ? 1
              : 0;
    color.setHex(spectralColors[paletteIndex]);
    const brightness = 0.48 + Math.pow(random(), 0.5) * 0.72;
    colors[index * 3] = color.r * brightness;
    colors[index * 3 + 1] = color.g * brightness;
    colors[index * 3 + 2] = color.b * brightness;
    sizes[index] = 3.2 + Math.pow(random(), 7.5) * (compactMode ? 8.2 : 12.5);
    phases[index] = random() * Math.PI * 2;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: {
      opacity: { value: 0.78 },
      time: { value: 0 },
      pixelRatio: { value: targetPixelRatio() }
    },
    vertexShader: `
      uniform float pixelRatio;
      attribute float aSize;
      attribute float aPhase;
      varying vec3 vColor;
      varying float vPhase;
      varying float vProminence;

      void main() {
        vColor = color;
        vPhase = aPhase;
        vProminence = smoothstep(6.0, 13.0, aSize);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float perspective = clamp(330.0 / max(-viewPosition.z, 90.0), 0.22, 2.25);
        gl_PointSize = clamp(aSize * perspective * pixelRatio, 0.8, 11.5);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      uniform float time;
      varying vec3 vColor;
      varying float vPhase;
      varying float vProminence;

      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float radius = length(point);
        if (radius > 0.5) discard;
        float halo = 1.0 - smoothstep(0.05, 0.5, radius);
        float core = 1.0 - smoothstep(0.0, 0.13, radius);
        float spikeX = exp(-abs(point.x) * 54.0) * (1.0 - smoothstep(0.08, 0.48, abs(point.y)));
        float spikeY = exp(-abs(point.y) * 54.0) * (1.0 - smoothstep(0.08, 0.48, abs(point.x)));
        float diffraction = (spikeX + spikeY) * vProminence * 0.24;
        float twinkle = 0.92 + 0.08 * sin(time * 0.48 + vPhase);
        float alpha = (halo * 0.44 + core * 0.82 + diffraction) * opacity * twinkle;
        vec3 color = vColor * (0.72 + core * 0.72 + diffraction * 0.5);
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    vertexColors: true,
    toneMapped: true
  });
  return new THREE.Points(geometry, material);
}

function createNebulaVeilTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const random = seededRandom(628109);
  const gradient = context.createRadialGradient(256, 256, 8, 256, 256, 252);
  gradient.addColorStop(0, 'rgba(255,255,255,0.72)');
  gradient.addColorStop(0.16, 'rgba(205,225,255,0.28)');
  gradient.addColorStop(0.48, 'rgba(120,150,210,0.08)');
  gradient.addColorStop(1, 'rgba(0,0,0,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  context.globalCompositeOperation = 'destination-out';
  for (let index = 0; index < 52; index += 1) {
    const x = 80 + random() * 352;
    const y = 80 + random() * 352;
    const radius = 18 + random() * 86;
    const voidGradient = context.createRadialGradient(x, y, 0, x, y, radius);
    voidGradient.addColorStop(0, `rgba(0,0,0,${0.05 + random() * 0.2})`);
    voidGradient.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = voidGradient;
    context.fillRect(x - radius, y - radius, radius * 2, radius * 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createDeepSpaceVeil() {
  const root = new THREE.Group();
  root.name = 'Deep-space reflection nebulae';
  const texture = createNebulaVeilTexture();
  const clouds = [
    { position: [-620, 250, -1320], scale: [1120, 640], color: 0x426ca8, opacity: 0.055 },
    { position: [690, -310, -1180], scale: [920, 720], color: 0x715687, opacity: 0.04 },
    { position: [90, 520, -1510], scale: [720, 470], color: 0x7f704f, opacity: 0.027 },
    { position: [-980, -390, -1680], scale: [980, 620], color: 0x34597d, opacity: 0.032 }
  ];
  clouds.slice(0, compactMode ? 3 : clouds.length).forEach((cloud) => {
    const material = new THREE.SpriteMaterial({
      map: texture,
      color: cloud.color,
      transparent: true,
      opacity: cloud.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      fog: false
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(...cloud.position);
    sprite.scale.set(cloud.scale[0], cloud.scale[1], 1);
    sprite.userData.baseOpacity = cloud.opacity;
    sprite.renderOrder = -20;
    root.add(sprite);
  });
  root.userData.texture = texture;
  return root;
}

function createOrbit(radius, color = 0x9ba9b6) {
  const points = [];
  const segments = 180;
  for (let index = 0; index <= segments; index += 1) {
    const angle = (index / segments) * Math.PI * 2;
    points.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius));
  }
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.23
  });
  const orbit = new THREE.Line(geometry, material);
  orbit.userData.baseOpacity = 0.23;
  return orbit;
}

function createCoronaTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const random = seededRandom(99173);
  const gradient = context.createRadialGradient(256, 256, 38, 256, 256, 250);
  gradient.addColorStop(0, 'rgba(255, 251, 232, 0.98)');
  gradient.addColorStop(0.16, 'rgba(255, 204, 118, 0.58)');
  gradient.addColorStop(0.43, 'rgba(255, 139, 58, 0.15)');
  gradient.addColorStop(1, 'rgba(255, 112, 40, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);

  context.save();
  context.translate(256, 256);
  context.globalCompositeOperation = 'screen';
  for (let index = 0; index < 260; index += 1) {
    const angle = random() * Math.PI * 2;
    const inner = 78 + random() * 32;
    const outer = inner + 36 + Math.pow(random(), 2.2) * 126;
    context.strokeStyle = index % 7 === 0 ? '#fff0c7' : '#ffad58';
    context.globalAlpha = 0.012 + random() * 0.052;
    context.lineWidth = 0.25 + random() * 1.15;
    context.beginPath();
    context.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    context.lineTo(Math.cos(angle + (random() - 0.5) * 0.025) * outer, Math.sin(angle + (random() - 0.5) * 0.025) * outer);
    context.stroke();
  }
  context.restore();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createNasaBackdrop() {
  const material = new THREE.SpriteMaterial({
    color: 0xdbe7ff,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    fog: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(0, 0, -900);
  sprite.scale.set(2200, 118, 1);
  sprite.frustumCulled = false;
  sprite.renderOrder = -9;
  sprite.userData.baseOpacity = 0.31;
  loadTexture(TEXTURE_SOURCES.milkyWayPanorama, 'Spitzer GLIMPSE 360 Milky Way panorama', (texture) => {
    material.map = texture;
    material.needsUpdate = true;
  });
  return sprite;
}

function createMinorBodyMaterial(opacity) {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexColors: true,
    toneMapped: true,
    uniforms: {
      opacity: { value: opacity }
    },
    vertexShader: `
      attribute float aSize;
      varying vec3 vColor;
      varying float vBrightness;
      void main() {
        vColor = color;
        vBrightness = clamp(aSize / 2.4, 0.35, 1.0);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float perspective = clamp(150.0 / max(-viewPosition.z, 28.0), 0.72, 4.2);
        gl_PointSize = clamp(aSize * perspective, 0.72, 5.5);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec3 vColor;
      varying float vBrightness;
      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float radius = length(point);
        if (radius > 0.5) discard;
        float sphere = sqrt(max(0.0, 1.0 - radius * radius * 4.0));
        float edge = 1.0 - smoothstep(0.34, 0.5, radius);
        vec3 color = vColor * (0.44 + sphere * 0.74);
        gl_FragColor = vec4(color, edge * opacity * vBrightness);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
}

function createAsteroidBelt(innerRadius, outerRadius) {
  const random = seededRandom(77291);
  const count = compactMode ? 680 : 1450;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const beltPosition = random();
    const resonanceGap = Math.abs(beltPosition - 0.42) < 0.035 || Math.abs(beltPosition - 0.72) < 0.022;
    const radius = mix(innerRadius, outerRadius, resonanceGap ? (beltPosition + 0.055) % 1 : beltPosition);
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = (random() + random() - 1) * 0.82;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
    color.setHSL(0.09, 0.08, 0.42 + random() * 0.25);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    sizes[index] = 0.74 + Math.pow(random(), 5.2) * 1.95;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const material = createMinorBodyMaterial(0.42);
  const belt = new THREE.Points(geometry, material);
  belt.userData.baseOpacity = 0.42;
  return belt;
}

function createKuiperBelt() {
  const random = seededRandom(940231);
  const count = compactMode ? 1050 : 2600;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = mix(84, 124, Math.pow(random(), 0.86));
    const verticalSpread = (random() + random() + random() - 1.5) * mix(2.2, 7.2, (radius - 84) / 40);
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = verticalSpread;
    positions[index * 3 + 2] = Math.sin(angle) * radius;

    color.setHSL(0.56 + random() * 0.1, 0.12 + random() * 0.22, 0.48 + random() * 0.3);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    sizes[index] = 0.65 + Math.pow(random(), 6.4) * 1.72;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  const belt = new THREE.Points(geometry, createMinorBodyMaterial(0.3));
  belt.userData.baseOpacity = 0.3;
  return belt;
}

function createZodiacalDust() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      opacity: { value: 0.15 }
    },
    vertexShader: `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec2 vUv;

      void main() {
        vec2 point = (vUv - 0.5) * 2.0;
        float radius = length(point);
        if (radius > 1.0) discard;
        float innerMask = smoothstep(0.035, 0.075, radius);
        float outerMask = 1.0 - smoothstep(0.72, 1.0, radius);
        float radialGlow = exp(-radius * 3.6);
        float grain = 0.93 + 0.07 * sin(point.x * 91.0 + point.y * 57.0);
        vec3 color = mix(vec3(1.0, 0.62, 0.28), vec3(0.32, 0.48, 0.72), radius);
        float alpha = innerMask * outerMask * radialGlow * grain * opacity;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
  const dust = new THREE.Mesh(new THREE.CircleGeometry(116, 192), material);
  dust.rotation.x = -Math.PI / 2;
  dust.position.y = -0.08;
  dust.renderOrder = -3;
  dust.userData.baseOpacity = 0.15;
  return dust;
}

function createHeliosphere() {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      opacity: { value: 0.052 }
    },
    vertexShader: `
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      void main() {
        vViewNormal = normalize(normalMatrix * normal);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;

      void main() {
        vec3 viewDirection = normalize(-vViewPosition);
        float rim = pow(1.0 - abs(dot(normalize(vViewNormal), viewDirection)), 2.7);
        float striation = 0.9 + 0.1 * sin(vViewPosition.y * 0.09 + vViewPosition.z * 0.025);
        vec3 color = mix(vec3(0.18, 0.46, 0.88), vec3(0.48, 0.78, 1.0), rim);
        gl_FragColor = vec4(color, (0.012 + rim * 0.988) * striation * opacity);
      }
    `
  });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1, 52, 34), material);
  shell.position.x = -7;
  shell.scale.set(132, 34, 102);
  shell.rotation.z = -0.035;
  shell.renderOrder = -2;
  shell.userData.baseOpacity = 0.052;
  return shell;
}

function createDwarfPlanet({ name, radius, distance, speed, inclination, color }) {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  pivot.rotation.z = inclination;
  const orbit = createOrbit(distance, 0x71839a);
  orbit.material.opacity = 0.075;
  orbit.userData.baseOpacity = 0.075;
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 22, 14),
    new THREE.MeshStandardMaterial({
      color,
      roughness: 0.92,
      emissive: new THREE.Color(color).multiplyScalar(0.12),
      emissiveIntensity: 0.18
    })
  );
  mesh.name = name;
  mesh.position.x = distance;
  mesh.userData.baseOpacity = 1;
  pivot.add(mesh);
  root.add(orbit, pivot);
  return { root, pivot, mesh, speed };
}

function createPlanetRim(radius, color, intensity = 0.16) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
    uniforms: {
      color: { value: new THREE.Color(color) },
      opacity: { value: intensity }
    },
    vertexShader: `
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      void main() {
        vViewNormal = normalize(normalMatrix * normal);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 color;
      uniform float opacity;
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vViewNormal), normalize(-vViewPosition))), 2.6);
        gl_FragColor = vec4(color, rim * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const rim = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.055, 40, 28), material);
  rim.userData.baseOpacity = intensity;
  return rim;
}

function createPlanet({ name, radius, distance, speed, inclination = 0, axialTilt = 0, textureSources = null }) {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  const texture = createPlanetTexture(name, textureAnisotropy, compactMode);
  const gasGiant = ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Venus'].includes(name);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    color: 0xffffff,
    roughness: name === 'Earth' ? 0.54 : gasGiant ? 0.76 : 0.9,
    metalness: 0,
    emissive: name === 'Neptune' ? 0x07132c : 0x080705,
    emissiveIntensity: name === 'Neptune' ? 0.1 : 0.035
  });
  if (name === 'Mercury' || name === 'Mars') {
    material.bumpMap = texture;
    material.bumpScale = name === 'Mars' ? 0.028 : 0.018;
  }
  if (textureSources) applyTexture(material, textureSources, name);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 56, 36), material);
  mesh.position.x = distance;
  mesh.rotation.z = axialTilt;
  mesh.userData.name = name;
  mesh.userData.baseOpacity = 1;

  const rimPresets = {
    Venus: [0xffc46f, 0.075],
    Earth: [0x50a8ff, 0.2],
    Mars: [0xe36e45, 0.045],
    Uranus: [0x8ee8ec, 0.07],
    Neptune: [0x4b88ff, 0.085]
  };
  if (rimPresets[name]) {
    mesh.add(createPlanetRim(radius, rimPresets[name][0], rimPresets[name][1]));
  }

  if (name === 'Earth') {
    const cloudMaterial = new THREE.MeshStandardMaterial({
      map: createCloudTexture(),
      transparent: true,
      opacity: 0.46,
      alphaTest: 0.018,
      depthWrite: false,
      roughness: 0.96,
      color: 0xf5f8ff
    });
    applyTexture(cloudMaterial, TEXTURE_SOURCES.clouds, 'Solar-system Earth clouds', { useAsAlphaMap: true });
    const cloudLayer = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.018, 48, 32), cloudMaterial);
    cloudLayer.userData.baseOpacity = 0.46;
    mesh.userData.cloudLayer = cloudLayer;
    mesh.add(cloudLayer);
  }
  pivot.rotation.z = inclination;
  pivot.add(mesh);
  root.add(createOrbit(distance), pivot);
  return { root, pivot, mesh, speed };
}

function addSatelliteSystem(body, satellites, color = 0xc7c4bb) {
  const pivots = [];
  satellites.forEach(({ radius, distance, speed, phase = 0 }) => {
    const pivot = new THREE.Group();
    const moon = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 20, 14),
      new THREE.MeshStandardMaterial({ color, roughness: 0.95 })
    );
    moon.position.x = distance;
    pivot.rotation.y = phase;
    const orbit = createOrbit(distance, 0x929aa4);
    orbit.material.opacity = 0.09;
    orbit.userData.baseOpacity = 0.09;
    pivot.add(orbit, moon);
    body.mesh.add(pivot);
    pivots.push({ pivot, speed });
  });
  return pivots;
}

function createSolarSystem() {
  const root = new THREE.Group();
  root.rotation.x = -0.34;
  root.position.set(18, -1.5, -8);

  const zodiacalDust = createZodiacalDust();
  const heliosphere = createHeliosphere();
  root.add(zodiacalDust, heliosphere);

  const sunMaterial = new THREE.ShaderMaterial({
    transparent: true,
    toneMapped: true,
    uniforms: {
      map: { value: createSunTexture(textureAnisotropy, compactMode) },
      opacity: { value: 1 },
      time: { value: 0 }
    },
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      void main() {
        vUv = uv;
        vViewNormal = normalize(normalMatrix * normal);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float opacity;
      uniform float time;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      void main() {
        vec2 flow = vec2(sin(time * 0.027) * 0.0016, cos(time * 0.019) * 0.0012);
        vec3 surface = texture2D(map, vUv + flow).rgb;
        vec3 detail = texture2D(map, vUv * vec2(1.013, 0.997) - flow * 0.7).rgb;
        float granulation = dot(mix(surface, detail, 0.34), vec3(0.299, 0.587, 0.114));
        float facing = max(dot(normalize(vViewNormal), normalize(-vViewPosition)), 0.0);
        float limb = pow(facing, 0.34);
        vec3 amber = vec3(1.0, 0.31, 0.035);
        vec3 gold = vec3(1.0, 0.77, 0.28);
        vec3 whiteHot = vec3(1.0, 0.96, 0.78);
        vec3 color = mix(amber, gold, smoothstep(0.18, 0.7, granulation));
        color = mix(color, whiteHot, smoothstep(0.64, 0.96, granulation) * limb * 0.62);
        color *= mix(0.56, 1.18, limb);
        gl_FragColor = vec4(color, opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(5.4, 72, 52), sunMaterial);
  sun.userData.baseOpacity = 1;
  const sunHaloMaterial = new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true,
    uniforms: {
      opacity: { value: 0.16 },
      time: { value: 0 }
    },
    vertexShader: `
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      void main() {
        vViewNormal = normalize(normalMatrix * normal);
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        vViewPosition = viewPosition.xyz;
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      uniform float time;
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;
      void main() {
        float rim = pow(1.0 - abs(dot(normalize(vViewNormal), normalize(-vViewPosition))), 2.25);
        float filaments = 0.9 + 0.1 * sin(vViewPosition.y * 6.5 + vViewPosition.x * 3.1 + time * 0.22);
        vec3 color = mix(vec3(1.0, 0.28, 0.035), vec3(1.0, 0.72, 0.27), rim);
        gl_FragColor = vec4(color, rim * filaments * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const sunHalo = new THREE.Mesh(new THREE.SphereGeometry(7.4, 64, 48), sunHaloMaterial);
  sunHalo.userData.baseOpacity = 0.16;

  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createCoronaTexture(),
    color: 0xffc274,
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  corona.scale.set(25, 25, 1);
  corona.userData.baseOpacity = 0.42;
  const coronaOuter = new THREE.Sprite(new THREE.SpriteMaterial({
    map: corona.material.map,
    color: 0xff8c46,
    transparent: true,
    opacity: 0.19,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  coronaOuter.scale.set(34, 34, 1);
  coronaOuter.material.rotation = 0.72;
  coronaOuter.userData.baseOpacity = 0.19;

  const prominences = new THREE.Group();
  [
    { radius: 6.05, tube: 0.095, arc: 0.72, rotation: [0.2, 0.5, -0.8], opacity: 0.26 },
    { radius: 5.95, tube: 0.07, arc: 0.52, rotation: [-0.7, 0.2, 1.8], opacity: 0.18 },
    { radius: 6.12, tube: 0.055, arc: 0.44, rotation: [0.8, -0.3, 2.7], opacity: 0.14 }
  ].slice(0, compactMode ? 2 : 3).forEach((loop) => {
    const material = new THREE.MeshBasicMaterial({
      color: 0xff7637,
      transparent: true,
      opacity: loop.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const arc = new THREE.Mesh(new THREE.TorusGeometry(loop.radius, loop.tube, 6, 72, loop.arc), material);
    arc.rotation.set(...loop.rotation);
    arc.userData.baseOpacity = loop.opacity;
    prominences.add(arc);
  });
  const solarLight = new THREE.PointLight(0xffdfb0, 245, 440, 1.45);
  root.add(sun, sunHalo, prominences, corona, coronaOuter, solarLight);

  const bodies = [
    createPlanet({ name: 'Mercury', radius: 0.42, distance: 10, speed: 0.76, inclination: 0.02, axialTilt: 0.01 }),
    createPlanet({ name: 'Venus', radius: 0.78, distance: 15, speed: 0.48, inclination: -0.04, axialTilt: 0.05 }),
    createPlanet({ name: 'Earth', radius: 0.88, distance: 21, speed: 0.34, inclination: 0.01, axialTilt: 0.41, textureSources: TEXTURE_SOURCES.earth }),
    createPlanet({ name: 'Mars', radius: 0.58, distance: 28, speed: 0.25, inclination: 0.05, axialTilt: 0.44 }),
    createPlanet({ name: 'Jupiter', radius: 2.1, distance: 39, speed: 0.13, inclination: -0.02, axialTilt: 0.05 }),
    createPlanet({ name: 'Saturn', radius: 1.78, distance: 52, speed: 0.09, inclination: 0.04, axialTilt: 0.47 }),
    createPlanet({ name: 'Uranus', radius: 1.22, distance: 65, speed: 0.062, inclination: -0.03, axialTilt: 1.71 }),
    createPlanet({ name: 'Neptune', radius: 1.18, distance: 77, speed: 0.048, inclination: 0.035, axialTilt: 0.49 })
  ];

  bodies.forEach((body) => root.add(body.root));

  const dwarfPlanets = [
    createDwarfPlanet({ name: 'Ceres', radius: 0.16, distance: 34.1, speed: 0.2, inclination: 0.09, color: 0xa7a49d }),
    createDwarfPlanet({ name: 'Pluto', radius: 0.19, distance: 88, speed: 0.041, inclination: 0.3, color: 0xc8a27f }),
    createDwarfPlanet({ name: 'Haumea', radius: 0.14, distance: 99, speed: 0.034, inclination: 0.49, color: 0xc7d6db }),
    createDwarfPlanet({ name: 'Makemake', radius: 0.17, distance: 110, speed: 0.03, inclination: 0.51, color: 0xb77f61 }),
    createDwarfPlanet({ name: 'Eris', radius: 0.18, distance: 121, speed: 0.024, inclination: 0.77, color: 0xd8d5ca })
  ];
  dwarfPlanets.forEach((body) => root.add(body.root));

  const moonPivot = new THREE.Group();
  const moonMaterial = new THREE.MeshStandardMaterial({ color: 0xb9b8b1, roughness: 0.9 });
  applyTexture(moonMaterial, TEXTURE_SOURCES.moon, 'LROC Moon');
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 20), moonMaterial);
  moon.position.x = 1.85;
  moonPivot.add(createOrbit(1.85, 0xbfc7cf), moon);
  bodies[2].mesh.add(moonPivot);

  const saturnRingMaterial = createRingMaterial();
  const saturnRing = new THREE.Mesh(new THREE.RingGeometry(2.22, 3.34, 160), saturnRingMaterial);
  saturnRing.rotation.x = Math.PI / 2;
  saturnRing.userData.baseOpacity = 0.78;
  bodies[5].mesh.add(saturnRing);

  const uranusRing = new THREE.Mesh(
    new THREE.RingGeometry(1.53, 1.82, 128),
    new THREE.MeshBasicMaterial({
      color: 0xaddce0,
      transparent: true,
      opacity: 0.16,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  uranusRing.rotation.x = Math.PI / 2;
  uranusRing.userData.baseOpacity = 0.16;
  bodies[6].mesh.add(uranusRing);

  const satellitePivots = [
    ...addSatelliteSystem(bodies[4], [
      { radius: 0.12, distance: 3.05, speed: 0.95, phase: 0.3 },
      { radius: 0.1, distance: 3.85, speed: 0.72, phase: 1.7 },
      { radius: 0.17, distance: 4.85, speed: 0.52, phase: 2.9 },
      { radius: 0.15, distance: 6.15, speed: 0.38, phase: 4.2 }
    ]),
    ...addSatelliteSystem(bodies[5], [
      { radius: 0.13, distance: 4.25, speed: 0.42, phase: 1.1 }
    ], 0xc5b387)
  ];

  const asteroidBelt = createAsteroidBelt(32.5, 35.5);
  const kuiperBelt = createKuiperBelt();
  root.add(asteroidBelt, kuiperBelt);

  return {
    root,
    bodies,
    moonPivot,
    sun,
    sunHalo,
    corona,
    coronaOuter,
    prominences,
    asteroidBelt,
    kuiperBelt,
    zodiacalDust,
    heliosphere,
    solarLight,
    satellitePivots,
    dwarfPlanets
  };
}

function updateTransitionRig(delta) {
  if (reduceMotion) {
    transitionRig.scale = state.scale;
    transitionRig.velocity = 0;
    transitionRig.motion = 0;
    transitionRig.direction = 0;
    return;
  }

  const localStep = controls.getScaleStep(state.scale);
  const scaleGap = state.targetScale - state.scale;
  const intendedVelocity = Math.abs(state.zoomVelocity) > 0.01 ? state.zoomVelocity : scaleGap * 4;
  const motionTarget = Math.max(
    clamp(Math.abs(state.zoomVelocity) / Math.max(localStep * 5.8, 1), 0, 1),
    clamp(Math.abs(scaleGap) / Math.max(localStep * 1.45, 1), 0, 1)
  );
  const motionResponse = motionTarget > transitionRig.motion ? 10.5 : 4.8;
  transitionRig.motion = damp(transitionRig.motion, motionTarget, motionResponse, delta);
  transitionRig.direction = damp(
    transitionRig.direction,
    Math.abs(intendedVelocity) > 0.05 ? Math.sign(intendedVelocity) : 0,
    7.2,
    delta
  );

  // A critically damped camera-scale spring gives the scene, camera and copy a
  // shared visual clock. It trails a fast zoom slightly, but never overshoots a
  // stage boundary when the wheel stops.
  const smoothTime = mix(0.145, 0.095, transitionRig.motion);
  const omega = 2 / smoothTime;
  const x = omega * delta;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const originalTarget = state.scale;
  const previousScale = transitionRig.scale;
  const maximumChange = mix(620, 3200, transitionRig.motion) * smoothTime;
  const change = clamp(transitionRig.scale - originalTarget, -maximumChange, maximumChange);
  const adjustedTarget = transitionRig.scale - change;
  const temporary = (transitionRig.velocity + omega * change) * delta;
  transitionRig.velocity = (transitionRig.velocity - omega * temporary) * decay;
  transitionRig.scale = adjustedTarget + (change + temporary) * decay;

  if ((originalTarget - previousScale > 0) === (transitionRig.scale > originalTarget)) {
    transitionRig.scale = originalTarget;
    transitionRig.velocity = 0;
  }
  transitionRig.scale = clamp(transitionRig.scale, 0, MAX_SCALE);
  if (Math.abs(transitionRig.scale - originalTarget) < 0.002 && Math.abs(transitionRig.velocity) < 0.02) {
    transitionRig.scale = originalTarget;
    transitionRig.velocity = 0;
  }
}

function computeCamera(scale, delta) {
  const planetTransition = smootherstep(0, 190, scale);
  const moonTransition = smootherstep(130, 360, scale);
  const solarTransition = smootherstep(300, 800, scale);
  const galaxyTransition = smootherstep(760, 1120, scale);
  const localTransition = smootherstep(1380, MAX_SCALE, scale);

  const nearDistance = compactMode ? 46 : 17.2;
  const planetDistance = compactMode ? 112 : 78;
  let distance = mix(mix(nearDistance, planetDistance, planetTransition), 215, solarTransition);
  distance = mix(distance, 240, galaxyTransition);
  distance = mix(distance, compactMode ? 1480 : 710, localTransition);

  const nearFov = compactMode ? 42 : 35;
  const planetFov = compactMode ? 46 : 42;
  let fov = mix(mix(nearFov, planetFov, planetTransition), 48, solarTransition);
  fov = mix(fov, 47, galaxyTransition);
  fov = mix(fov, compactMode ? 52 : 49, localTransition);
  const kineticFov = transitionRig.motion * transitionRig.direction * (compactMode ? 1.05 : 1.55);
  fov += kineticFov;

  let orbitAngle = mix(-0.28, -0.58, galaxyTransition) + transitionRig.motion * transitionRig.direction * 0.012;
  orbitAngle = mix(orbitAngle, -0.06, localTransition) + state.orbitYaw;
  let elevation = mix(0.18, 1.16, galaxyTransition);
  elevation = clamp(mix(elevation, 0.38, localTransition) + state.orbitPitch, -0.14, 1.42);

  cameraSolarCenter.set(mix(0, 18, moonTransition), 0, mix(0, -8, solarTransition));
  targetLookAt
    .copy(cameraSolarCenter)
    .lerp(cameraGalaxyCenter, galaxyTransition)
    .lerp(cameraLocalCenter, localTransition);

  targetPosition.set(
    targetLookAt.x + Math.sin(orbitAngle) * distance,
    targetLookAt.y + Math.sin(elevation) * distance + mix(1.5, 10, solarTransition),
    targetLookAt.z + Math.cos(orbitAngle) * distance
  );

  if (reduceMotion) camera.fov = fov;
  else camera.fov = damp(camera.fov, fov, mix(8.4, 5.6, transitionRig.motion), delta);
  camera.updateProjectionMatrix();
}

function setGroupOpacity(group, opacity) {
  group.traverse((object) => {
    if (!object.material) return;
    const nextOpacity = (object.userData.baseOpacity ?? 1) * opacity;
    if (object.material.uniforms?.opacity) object.material.uniforms.opacity.value = nextOpacity;
    if (typeof object.material.opacity === 'number') {
      object.material.transparent = true;
      object.material.opacity = nextOpacity;
    }
  });
}

function updateVisibility(scale) {
  const moonFade = smootherstep(125, 235, scale) * (1 - smootherstep(360, 535, scale));
  const mainPlanetFade = 1 - smootherstep(375, 555, scale);
  const solarFadeIn = smootherstep(315, 535, scale);
  const solarFadeOut = 1 - smootherstep(835, 1130, scale);
  const solarOpacity = solarFadeIn * solarFadeOut;
  galaxyOpacity = smootherstep(760, 1110, scale);
  localGroupOpacity = smootherstep(1290, 1635, scale);

  const planetScale = mix(1, 0.45, smootherstep(105, 375, scale));
  planetGroup.scale.setScalar(planetScale);
  planetGroup.visible = mainPlanetFade > 0.01;
  earth.material.uniforms.opacity.value = mainPlanetFade;
  const liveSurfaceMix = earth.material.uniforms.liveMix.value;
  const closeSurfaceCloudOpacity = mix(0.2, 0.58, smootherstep(28, 132, scale));
  clouds.material.opacity = closeSurfaceCloudOpacity * mix(1, 0.32, liveSurfaceMix) * mainPlanetFade;
  atmosphere.material.uniforms.intensity.value = 0.98 * mainPlanetFade;
  aurora.material.uniforms.intensity.value = 0.48 * mainPlanetFade;

  moonSystem.root.visible = moonFade > 0.01;
  moonSystem.moon.material.transparent = true;
  moonSystem.moon.material.opacity = moonFade;
  moonSystem.root.children[0].material.opacity = 0.16 * moonFade;

  solarGroup.visible = solarOpacity > 0.001;
  setGroupOpacity(solarGroup, solarOpacity);
  solarSystem.solarLight.intensity = 245 * solarOpacity;

  const backdropIn = smootherstep(675, 920, scale);
  const backdropOut = 1 - smootherstep(955, 1210, scale);
  nasaBackdrop.material.opacity = nasaBackdrop.userData.baseOpacity * backdropIn * backdropOut;

  cosmicGroup.visible = galaxyOpacity > 0.001;
  starField.material.uniforms.opacity.value = mix(0.58, 0.88, smootherstep(160, 780, scale));
  galaxyGlow.material.opacity = mix(0.1, 0.17, smootherstep(170, 740, scale)) * (1 - galaxyOpacity * 0.76);
  const veilStrength = mix(0.72, 1, smootherstep(245, 740, scale)) * (1 - smootherstep(960, 1440, scale));
  setGroupOpacity(deepSpaceVeil, veilStrength);
  scene.fog.density = mix(0.00082, 0.000035, smootherstep(230, 930, scale));
  renderer.toneMappingExposure = mix(1.18, 1.01, smootherstep(890, 1410, scale));

  const markerOpacity = smootherstep(1015, 1090, scale) * (1 - smootherstep(1415, 1510, scale));
  locationMarker.style.setProperty('--marker-opacity', markerOpacity.toFixed(3));
  locationMarker.classList.toggle('is-visible', markerOpacity > 0.002);
  if (earthRealtimeStatus) {
    const realtimeOpacity = 1 - smootherstep(155, 360, scale);
    earthRealtimeStatus.style.setProperty('--earth-realtime-opacity', realtimeOpacity.toFixed(3));
  }
  scaleBar.style.transform = `scaleX(${clamp(scale / MAX_SCALE, 0, 1).toFixed(4)})`;
}

function updateCopy(scale) {
  const nextStageIndex = copy.findIndex((item) => scale <= item.max);
  const resolvedStageIndex = nextStageIndex === -1 ? copy.length - 1 : nextStageIndex;
  const active = copy[resolvedStageIndex];
  const stageStart = resolvedStageIndex === 0 ? 0 : copy[resolvedStageIndex - 1].max;
  const stageEnd = resolvedStageIndex === copy.length - 1 ? MAX_SCALE : Math.min(active.max, MAX_SCALE);
  const stageSpan = Math.max(stageEnd - stageStart, 1);
  const distanceFromStart = resolvedStageIndex === 0 ? Number.POSITIVE_INFINITY : Math.abs(scale - stageStart);
  const distanceFromEnd = resolvedStageIndex === copy.length - 1 ? Number.POSITIVE_INFINITY : Math.abs(stageEnd - scale);
  const boundaryDistance = Math.min(distanceFromStart, distanceFromEnd);
  const boundaryWidth = clamp(stageSpan * 0.18, 18, 54);
  const stagePresence = reduceMotion
    ? 1
    : mix(0.08, 1, smootherstep(0, boundaryWidth, boundaryDistance));
  const localStageProgress = clamp((scale - stageStart) / stageSpan, 0, 1);
  const boundarySide = localStageProgress < 0.5 ? -1 : 1;
  const travelDirection = Math.abs(transitionRig.direction) > 0.05 ? Math.sign(transitionRig.direction) : 1;
  const stageShift = reduceMotion ? 0 : (1 - stagePresence) * boundarySide * travelDirection * 7;
  const stageBlur = reduceMotion ? 0 : (1 - stagePresence) * 0.78;
  const veilOpacity = reduceMotion ? 0 : transitionRig.motion * 0.105 + (1 - stagePresence) * 0.055;

  experience.style.setProperty('--stage-presence', stagePresence.toFixed(3));
  experience.style.setProperty('--stage-shift', `${stageShift.toFixed(2)}px`);
  experience.style.setProperty('--stage-blur', `${stageBlur.toFixed(2)}px`);
  experience.style.setProperty('--transition-veil-opacity', veilOpacity.toFixed(3));

  if (resolvedStageIndex !== activeStageIndex) {
    activeStageIndex = resolvedStageIndex;
    layerName.textContent = active.layer;
    scaleUnit.textContent = active.unit;
    captionZh.textContent = active.zh;
    captionEn.textContent = active.en;
    active.facts.forEach((fact, index) => {
      if (stageFacts[index]) stageFacts[index].textContent = fact;
    });
    experience.dataset.stageIndex = String(activeStageIndex);
    meterTicks.forEach((tick, index) => {
      tick.classList.toggle('is-active', index === activeStageIndex);
      tick.classList.toggle('is-passed', index < activeStageIndex);
    });
    stageStatus.textContent = `${active.layer}。${active.unit}。${active.zh}`;
  }

  if (scale <= 70) {
    const altitude = Math.round(mix(120, 2000, scale / 70));
    distanceValue.textContent = `距地表 · ${altitude.toLocaleString('zh-CN')} KM`;
  } else if (scale <= 190) {
    distanceValue.textContent = '地球直径 · 12,742 KM';
  } else if (scale <= 380) {
    const lunarDistance = Math.round(mix(38, 384, (scale - 190) / 190));
    distanceValue.textContent = `距月球 · ${lunarDistance.toLocaleString('zh-CN')},000 KM`;
  } else if (scale <= 800) {
    const astronomicalUnits = mix(0.08, 30, (scale - 380) / 420);
    distanceValue.textContent = `距太阳 · ${astronomicalUnits.toFixed(astronomicalUnits < 2 ? 2 : 1)} AU · 轨道压缩展示`;
  } else if (scale <= 1050) {
    const lightYears = mix(0.02, 4.24, (scale - 800) / 250);
    distanceValue.textContent = `距太阳 · ${lightYears.toFixed(2)} 光年`;
  } else if (scale <= 1450) {
    distanceValue.textContent = '当前位置 · 猎户支臂';
  } else {
    const millionLightYears = mix(0.1, 10, (scale - 1450) / 350);
    distanceValue.textContent = `观察尺度 · ${millionLightYears.toFixed(1)} 百万光年`;
  }
}

function updateInteractions(delta) {
  const input = controls.update(delta, controlsFrame);
  state.scale = input.scale;
  state.targetScale = input.targetScale;
  state.zoomVelocity = input.zoomVelocity;
  state.orbitYaw = input.yaw;
  state.orbitPitch = input.pitch;
}

function animateBodies(delta, visualScale) {
  liveEarthController.update();
  const liveMixResponse = reduceMotion ? 40 : 2.4;
  const liveDetailBlend = mix(0.06, 1, smootherstep(42, 175, visualScale));
  earth.material.uniforms.liveMix.value = damp(
    earth.material.uniforms.liveMix.value,
    liveEarthMixTarget * liveDetailBlend,
    liveMixResponse,
    delta
  );
  earth.material.uniforms.surfaceDetail.value = mix(
    compactMode ? 0.24 : 0.96,
    compactMode ? 0.12 : 0.32,
    smootherstep(55, 205, visualScale)
  );
  milkyWaySkyBand.update(delta, visualScale);

  if (reduceMotion) {
    aurora.material.uniforms.time.value = 0;
    starField.material.uniforms.time.value = 0;
    solarSystem.sun.material.uniforms.time.value = 0;
    solarSystem.sunHalo.material.uniforms.time.value = 0;
    solarSystem.corona.scale.set(25, 25, 1);
    solarSystem.coronaOuter.scale.set(34, 34, 1);
    cosmicEnvironment.update(0, galaxyOpacity, localGroupOpacity, false);
    return;
  }

  earth.rotation.y += delta * 0.038;
  clouds.rotation.y += delta * 0.064;
  atmosphere.rotation.y += delta * 0.018;
  aurora.rotation.y += delta * 0.021;
  aurora.material.uniforms.time.value = clock.elapsedTime;
  moonSystem.pivot.rotation.y += delta * 0.055;
  moonSystem.moon.rotation.y += delta * 0.06;
  starField.rotation.y += delta * 0.003;
  starField.material.uniforms.time.value = clock.elapsedTime;
  deepSpaceVeil.rotation.y += delta * 0.00038;
  solarSystem.sun.rotation.y += delta * 0.045;
  solarSystem.sunHalo.rotation.y += delta * 0.1;
  solarSystem.sun.material.uniforms.time.value = clock.elapsedTime;
  solarSystem.sunHalo.material.uniforms.time.value = clock.elapsedTime;
  solarSystem.corona.material.rotation += delta * 0.006;
  solarSystem.coronaOuter.material.rotation -= delta * 0.0035;
  solarSystem.prominences.rotation.y += delta * 0.018;
  solarSystem.asteroidBelt.rotation.y += delta * 0.008;
  solarSystem.kuiperBelt.rotation.y -= delta * 0.0018;

  const coronaSize = 25 + Math.sin(clock.elapsedTime * 0.75) * 0.7;
  solarSystem.corona.scale.set(coronaSize, coronaSize, 1);
  const outerCoronaSize = 34 + Math.sin(clock.elapsedTime * 0.43 + 1.4) * 0.9;
  solarSystem.coronaOuter.scale.set(outerCoronaSize, outerCoronaSize, 1);

  solarSystem.bodies.forEach((body) => {
    body.pivot.rotation.y += delta * body.speed;
    body.mesh.rotation.y += delta * 0.2;
    if (body.mesh.userData.cloudLayer) {
      body.mesh.userData.cloudLayer.rotation.y += delta * 0.082;
    }
  });
  solarSystem.moonPivot.rotation.y += delta * 0.82;
  solarSystem.satellitePivots.forEach(({ pivot, speed }) => {
    pivot.rotation.y += delta * speed;
  });
  solarSystem.dwarfPlanets.forEach((body) => {
    body.pivot.rotation.y += delta * body.speed;
    body.mesh.rotation.y += delta * 0.12;
  });
  cosmicEnvironment.update(delta, galaxyOpacity, localGroupOpacity, true);
}

function render() {
  const delta = Math.min(clock.getDelta(), 0.033);
  updateInteractions(delta);
  updateTransitionRig(delta);
  const visualScale = transitionRig.scale;
  computeCamera(visualScale, delta);
  updateVisibility(visualScale);
  updateCopy(visualScale);
  animateBodies(delta, visualScale);

  if (reduceMotion) {
    currentPosition.copy(targetPosition);
    currentLookAt.copy(targetLookAt);
  } else {
    const positionResponse = mix(8.8, 6.8, transitionRig.motion);
    const lookResponse = mix(10.6, 8.4, transitionRig.motion);
    currentPosition.lerp(targetPosition, 1 - Math.exp(-positionResponse * delta));
    currentLookAt.lerp(targetLookAt, 1 - Math.exp(-lookResponse * delta));
  }
  camera.position.copy(currentPosition);
  camera.lookAt(currentLookAt);

  renderer.render(scene, camera);
  requestAnimationFrame(render);
}

function markInteracted() {
  if (state.interacted) return;
  state.interacted = true;
  hint.classList.add('is-hidden');
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(targetPixelRatio());
  starField.material.uniforms.pixelRatio.value = targetPixelRatio();
  renderer.setSize(window.innerWidth, window.innerHeight);
  milkyWaySkyBand.resize(window.innerWidth, window.innerHeight);
});

window.__scaleBeyond = {
  maxScale: MAX_SCALE,
  setScale(value) {
    const nextScale = clamp(Number(value) || 0, 0, MAX_SCALE);
    controls.setScale(nextScale, { immediate: true, clearVelocity: true });
    state.scale = nextScale;
    state.targetScale = nextScale;
    state.zoomVelocity = 0;
    transitionRig.scale = nextScale;
    transitionRig.velocity = 0;
    transitionRig.motion = 0;
    transitionRig.direction = 0;
  },
  getState() {
    return {
      scale: state.scale,
      targetScale: state.targetScale,
      layer: layerName.textContent,
      assets: assetStatus.textContent,
      liveEarth: liveEarthSnapshot
        ? (() => {
            const currentLiveEarth = liveEarthController.getState();
            return {
              phase: currentLiveEarth.phase,
              date: currentLiveEarth.date,
              satellite: currentLiveEarth.satellite,
              quality: currentLiveEarth.budget.tier,
              subsolarLatitude: currentLiveEarth.solar?.subsolarLatitudeDegrees ?? null,
              subsolarLongitude: currentLiveEarth.solar?.subsolarLongitudeDegrees ?? null
            };
          })()
        : null,
      skyBandLoaded: milkyWaySkyBand.loaded,
      reducedMotion: reduceMotion,
      yaw: state.orbitYaw,
      pitch: state.orbitPitch,
      zoomVelocity: controls.snapshot().zoomVelocity
    };
  }
};

window.addEventListener('pagehide', (event) => {
  if (!event.persisted) liveEarthController.dispose();
});

render();
