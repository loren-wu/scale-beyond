import * as THREE from 'three';
import { createPlanetTexture, createRingMaterial, createSunTexture } from './src/planet-textures.js';
import { createCosmicEnvironment } from './src/galaxy.js';
import { createSkyBand } from './src/sky-band.js';

const container = document.getElementById('scene');
const experience = document.querySelector('.experience');
const scaleReadoutPanel = document.querySelector('.scale-readout');
const captionPanel = document.querySelector('.caption');
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
const locationMarker = document.getElementById('locationMarker');

const EARTH_RADIUS = 8;
const MAX_SCALE = 1800;
const compactMode = window.innerWidth < 760;
const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduceMotion = motionQuery.matches;

const TEXTURE_SOURCES = {
  earth: [
    'assets/nasa/earth-blue-marble-2048.jpg',
    'https://assets.science.nasa.gov/dynamicimage/assets/science/esd/eo/images/bmng/bmng-topography-bathymetry/january/world.topo.bathy.200401.3x5400x2700.jpg?w=2048&h=1024&fit=crop&crop=faces%2Cfocalpoint'
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
  drag: new THREE.Vector2(0, 0),
  dragTarget: new THREE.Vector2(0, 0),
  dragVelocity: new THREE.Vector2(0, 0),
  pointer: new THREE.Vector2(0, 0),
  previousPointer: new THREE.Vector2(0, 0),
  isDragging: false,
  interacted: false,
  previousPinchDistance: 0
};

const activePointers = new Map();
let milkyWaySkyBand = null;

motionQuery.addEventListener('change', (event) => {
  reduceMotion = event.matches;
  if (reduceMotion) state.dragVelocity.set(0, 0);
  if (milkyWaySkyBand) milkyWaySkyBand.setMotionEnabled(!reduceMotion);
});

if (window.matchMedia('(pointer: coarse)').matches) {
  const [zoomHint, dragHint] = hint.querySelectorAll('span');
  zoomHint.textContent = '双指缩放';
  dragHint.textContent = '单指拖拽观察';
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x030713, 0.00135);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 8000);
camera.position.set(0, 2, 16);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x030713, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
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
scene.add(new THREE.AmbientLight(0xa9c5e8, 0.11));

const textureAnisotropy = renderer.capabilities.getMaxAnisotropy();
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

const earth = createEarth();
const clouds = createClouds();
const atmosphere = createAtmosphere();
const aurora = createAurora();
const moonSystem = createMoonSystem();
planetGroup.add(earth, clouds, atmosphere, aurora, moonSystem.root);

const starField = createStarField();
const galaxyGlow = createGalaxyGlow();
world.add(starField, galaxyGlow);

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

const nasaBackdrop = createNasaBackdrop();
camera.add(nasaBackdrop);

const targetLookAt = new THREE.Vector3();
const currentLookAt = new THREE.Vector3();
const targetPosition = new THREE.Vector3();
const currentPosition = new THREE.Vector3().copy(camera.position);

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
      nightMap: { value: nightTexture },
      sunDirection: { value: sunDirection.clone() },
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
      uniform sampler2D nightMap;
      uniform vec3 sunDirection;
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;

      void main() {
        vec3 normal = normalize(vViewNormal);
        vec3 lightDirection = normalize((viewMatrix * vec4(sunDirection, 0.0)).xyz);
        vec3 viewDirection = normalize(-vViewPosition);
        float sunAmount = dot(normal, lightDirection);
        float dayBlend = smoothstep(-0.88, -0.12, sunAmount);
        float daylight = 0.55 + max(sunAmount + 0.15, 0.0) * 0.65;
        vec3 dayColor = texture2D(dayMap, vUv).rgb;
        vec3 nightColor = texture2D(nightMap, vUv).rgb * 3.2;
        float oceanMask = smoothstep(0.035, 0.22, dayColor.b - max(dayColor.r, dayColor.g) * 0.72);
        vec3 reflected = reflect(-lightDirection, normal);
        float specular = pow(max(dot(reflected, viewDirection), 0.0), 54.0) * oceanMask * max(sunAmount, 0.0);
        float twilight = exp(-abs(sunAmount) * 22.0) * 0.07;
        vec3 color = mix(nightColor, dayColor * daylight, dayBlend);
        color += vec3(0.5, 0.68, 0.92) * specular * 0.72;
        color += vec3(1.0, 0.34, 0.11) * twilight;
        gl_FragColor = vec4(color, opacity);
      }
    `
  });

  loadTexture(TEXTURE_SOURCES.earth, 'Blue Marble Earth', (texture) => {
    const previous = material.uniforms.dayMap.value;
    material.uniforms.dayMap.value = texture;
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
    opacity: 0.54,
    alphaTest: 0.018,
    depthWrite: false,
    roughness: 1
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
        float rim = pow(1.0 - abs(dot(normal, viewDirection)), 2.35);
        float sunAmount = dot(normal, normalize(sunDirection));
        float daylight = smoothstep(-0.3, 0.45, sunAmount);
        float terminator = exp(-abs(sunAmount) * 16.0);
        vec3 color = mix(vec3(0.13, 0.34, 0.95), vec3(0.42, 0.76, 1.0), daylight);
        color += vec3(1.0, 0.24, 0.07) * terminator * 0.2;
        gl_FragColor = vec4(color, rim * intensity * (0.34 + daylight * 0.66));
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
  const count = compactMode ? 4500 : 9000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const radius = 520 + random() * 1150;
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    positions[index * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[index * 3 + 1] = radius * Math.cos(phi);
    positions[index * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    color.setHSL(0.56 + random() * 0.08, 0.12, 0.62 + random() * 0.28);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 1.15,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.78,
    depthWrite: false
  });
  return new THREE.Points(geometry, material);
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
  const gradient = context.createRadialGradient(256, 256, 42, 256, 256, 250);
  gradient.addColorStop(0, 'rgba(255, 245, 220, 0.95)');
  gradient.addColorStop(0.18, 'rgba(255, 193, 105, 0.55)');
  gradient.addColorStop(0.48, 'rgba(255, 139, 58, 0.14)');
  gradient.addColorStop(1, 'rgba(255, 112, 40, 0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(canvas);
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

function createAsteroidBelt(innerRadius, outerRadius) {
  const random = seededRandom(77291);
  const count = compactMode ? 450 : 900;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const angle = random() * Math.PI * 2;
    const radius = mix(innerRadius, outerRadius, random());
    positions[index * 3] = Math.cos(angle) * radius;
    positions[index * 3 + 1] = (random() - 0.5) * 1.15;
    positions[index * 3 + 2] = Math.sin(angle) * radius;
    color.setHSL(0.09, 0.08, 0.42 + random() * 0.25);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.12,
    vertexColors: true,
    transparent: true,
    opacity: 0.38,
    depthWrite: false
  });
  const belt = new THREE.Points(geometry, material);
  belt.userData.baseOpacity = 0.38;
  return belt;
}

function createKuiperBelt() {
  const random = seededRandom(940231);
  const count = compactMode ? 820 : 1800;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
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
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const belt = new THREE.Points(geometry, new THREE.PointsMaterial({
    size: compactMode ? 0.2 : 0.16,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0.27,
    depthWrite: false
  }));
  belt.userData.baseOpacity = 0.27;
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

function createPlanet({ name, radius, distance, speed, inclination = 0, axialTilt = 0, textureSources = null }) {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  const material = new THREE.MeshStandardMaterial({
    map: createPlanetTexture(name, textureAnisotropy, compactMode),
    color: 0xffffff,
    roughness: name === 'Earth' ? 0.66 : 0.82,
    metalness: 0,
    emissive: name === 'Neptune' ? 0x07132c : 0x080705,
    emissiveIntensity: 0.08
  });
  if (textureSources) applyTexture(material, textureSources, name);
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 56, 36), material);
  mesh.position.x = distance;
  mesh.rotation.z = axialTilt;
  mesh.userData.name = name;
  mesh.userData.baseOpacity = 1;
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

  const sunMaterial = new THREE.MeshBasicMaterial({
    map: createSunTexture(textureAnisotropy, compactMode),
    color: 0xfff0ce
  });
  const sun = new THREE.Mesh(new THREE.SphereGeometry(5.4, 72, 52), sunMaterial);
  sun.userData.baseOpacity = 1;
  const sunHalo = new THREE.Mesh(
    new THREE.SphereGeometry(7.4, 64, 48),
    new THREE.MeshBasicMaterial({
      color: 0xffb45c,
      transparent: true,
      opacity: 0.09,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })
  );
  sunHalo.userData.baseOpacity = 0.09;

  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: createCoronaTexture(),
    color: 0xffc274,
    transparent: true,
    opacity: 0.48,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  }));
  corona.scale.set(25, 25, 1);
  corona.userData.baseOpacity = 0.48;
  const solarLight = new THREE.PointLight(0xffdfb0, 245, 440, 1.45);
  root.add(sun, sunHalo, corona, solarLight);

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
    asteroidBelt,
    kuiperBelt,
    zodiacalDust,
    heliosphere,
    solarLight,
    satellitePivots,
    dwarfPlanets
  };
}

function computeCamera(scale) {
  const planetTransition = smoothstep(0, 190, scale);
  const moonTransition = smoothstep(130, 360, scale);
  const solarTransition = smoothstep(300, 800, scale);
  const galaxyTransition = smoothstep(760, 1120, scale);
  const localTransition = smoothstep(1380, MAX_SCALE, scale);

  let distance = mix(mix(10.2, 78, planetTransition), 215, solarTransition);
  distance = mix(distance, 320, galaxyTransition);
  distance = mix(distance, compactMode ? 1600 : 980, localTransition);

  let fov = mix(mix(35, 42, planetTransition), 48, solarTransition);
  fov = mix(fov, 50, galaxyTransition);
  fov = mix(fov, 53, localTransition);

  let orbitAngle = mix(-0.28, -0.58, galaxyTransition);
  orbitAngle = mix(orbitAngle, -0.06, localTransition) + state.drag.x * 0.0035;
  let elevation = mix(0.18, 1.0, galaxyTransition);
  elevation = mix(elevation, 0.38, localTransition) + state.drag.y * 0.0012;

  const solarCenter = new THREE.Vector3(mix(0, 18, moonTransition), 0, mix(0, -8, solarTransition));
  const galaxyCenter = new THREE.Vector3(0, 0, -60);
  const localCenter = new THREE.Vector3(35, 8, -78);
  targetLookAt.copy(solarCenter).lerp(galaxyCenter, galaxyTransition).lerp(localCenter, localTransition);

  const panAmount = mix(mix(0.024, 0.08, solarTransition), 0.42, galaxyTransition);
  const localPanAmount = mix(panAmount, 1.05, localTransition);
  targetLookAt.x += state.drag.x * localPanAmount;
  targetLookAt.y += state.drag.y * localPanAmount * 0.62;

  targetPosition.set(
    targetLookAt.x + Math.sin(orbitAngle) * distance,
    targetLookAt.y + Math.sin(elevation) * distance + mix(1.5, 10, solarTransition),
    targetLookAt.z + Math.cos(orbitAngle) * distance
  );

  if (reduceMotion) camera.fov = fov;
  else camera.fov += (fov - camera.fov) * 0.055;
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
  const moonFade = smoothstep(135, 225, scale) * (1 - smoothstep(370, 520, scale));
  const mainPlanetFade = 1 - smoothstep(390, 540, scale);
  const solarFadeIn = smoothstep(330, 520, scale);
  const solarFadeOut = 1 - smoothstep(850, 1110, scale);
  const solarOpacity = solarFadeIn * solarFadeOut;
  galaxyOpacity = smoothstep(790, 1080, scale);
  localGroupOpacity = smoothstep(1320, 1600, scale);

  const planetScale = mix(1, 0.45, smoothstep(115, 360, scale));
  planetGroup.scale.setScalar(planetScale);
  planetGroup.visible = mainPlanetFade > 0.01;
  earth.material.uniforms.opacity.value = mainPlanetFade;
  clouds.material.opacity = 0.54 * mainPlanetFade;
  atmosphere.material.uniforms.intensity.value = 0.92 * mainPlanetFade;
  aurora.material.uniforms.intensity.value = 0.64 * mainPlanetFade;

  moonSystem.root.visible = moonFade > 0.01;
  moonSystem.moon.material.transparent = true;
  moonSystem.moon.material.opacity = moonFade;
  moonSystem.root.children[0].material.opacity = 0.16 * moonFade;

  solarGroup.visible = solarOpacity > 0.001;
  setGroupOpacity(solarGroup, solarOpacity);
  solarSystem.solarLight.intensity = 245 * solarOpacity;

  const backdropIn = smoothstep(700, 900, scale);
  const backdropOut = 1 - smoothstep(980, 1190, scale);
  nasaBackdrop.material.opacity = nasaBackdrop.userData.baseOpacity * backdropIn * backdropOut;

  cosmicGroup.visible = galaxyOpacity > 0.001;
  starField.material.opacity = mix(0.62, 0.93, smoothstep(170, 760, scale));
  galaxyGlow.material.opacity = mix(0.1, 0.17, smoothstep(180, 720, scale)) * (1 - galaxyOpacity * 0.76);
  scene.fog.density = mix(0.00135, 0.0001, smoothstep(280, 920, scale));
  renderer.toneMappingExposure = mix(1.12, 0.94, smoothstep(880, 1280, scale));

  locationMarker.classList.toggle('is-visible', scale >= 1050 && scale < 1480);
  scaleBar.style.transform = `scaleX(${clamp(scale / MAX_SCALE, 0, 1).toFixed(4)})`;
}

function updateCopy(scale) {
  const nextStageIndex = copy.findIndex((item) => scale <= item.max);
  const resolvedStageIndex = nextStageIndex === -1 ? copy.length - 1 : nextStageIndex;
  const active = copy[resolvedStageIndex];

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

    if (!reduceMotion) {
      [scaleReadoutPanel, captionPanel].forEach((panel, panelIndex) => {
        panel.getAnimations().forEach((animation) => animation.cancel());
        panel.animate(
          [
            { opacity: 0.48, transform: `translateY(${panelIndex === 0 ? -3 : 5}px)` },
            { opacity: 1, transform: 'translateY(0)' }
          ],
          { duration: 380, easing: 'cubic-bezier(.2,.72,.2,1)' }
        );
      });
    }
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

function updateInteractions() {
  if (reduceMotion) {
    state.scale = state.targetScale;
    state.dragVelocity.set(0, 0);
    state.dragTarget.x = clamp(state.dragTarget.x, -220, 220);
    state.dragTarget.y = clamp(state.dragTarget.y, -160, 160);
    state.drag.copy(state.dragTarget);
    return;
  }

  state.scale += (state.targetScale - state.scale) * 0.075;

  if (!state.isDragging) {
    state.dragVelocity.multiplyScalar(0.91);
    state.dragTarget.add(state.dragVelocity);
  }

  state.dragTarget.x = clamp(state.dragTarget.x, -220, 220);
  state.dragTarget.y = clamp(state.dragTarget.y, -160, 160);
  state.drag.lerp(state.dragTarget, 0.09);
}

function animateBodies(delta) {
  milkyWaySkyBand.update(delta, state.scale);

  if (reduceMotion) {
    aurora.material.uniforms.time.value = 0;
    solarSystem.corona.scale.set(25, 25, 1);
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
  solarSystem.sun.rotation.y += delta * 0.045;
  solarSystem.sunHalo.rotation.y += delta * 0.1;
  solarSystem.asteroidBelt.rotation.y += delta * 0.008;
  solarSystem.kuiperBelt.rotation.y -= delta * 0.0018;

  const coronaSize = 25 + Math.sin(clock.elapsedTime * 0.75) * 0.7;
  solarSystem.corona.scale.set(coronaSize, coronaSize, 1);

  solarSystem.bodies.forEach((body) => {
    body.pivot.rotation.y += delta * body.speed;
    body.mesh.rotation.y += delta * 0.2;
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
  updateInteractions();
  computeCamera(state.scale);
  updateVisibility(state.scale);
  updateCopy(state.scale);
  animateBodies(delta);

  if (reduceMotion) {
    currentPosition.copy(targetPosition);
    currentLookAt.copy(targetLookAt);
  } else {
    currentPosition.lerp(targetPosition, 0.055);
    currentLookAt.lerp(targetLookAt, 0.065);
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

window.addEventListener('wheel', (event) => {
  event.preventDefault();
  markInteracted();
  state.targetScale = clamp(state.targetScale + event.deltaY * 0.68, 0, MAX_SCALE);
}, { passive: false });

renderer.domElement.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'mouse' && event.button !== 0) return;
  event.preventDefault();
  markInteracted();
  activePointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
  renderer.domElement.setPointerCapture(event.pointerId);

  if (activePointers.size === 1) {
    state.isDragging = true;
    state.pointer.set(event.clientX, event.clientY);
    state.previousPointer.copy(state.pointer);
  } else {
    const [first, second] = [...activePointers.values()];
    state.isDragging = false;
    state.previousPinchDistance = first.distanceTo(second);
  }
  document.body.classList.add('is-dragging');
});

renderer.domElement.addEventListener('pointermove', (event) => {
  if (!activePointers.has(event.pointerId)) return;
  event.preventDefault();
  activePointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));

  if (activePointers.size >= 2) {
    const [first, second] = [...activePointers.values()];
    const pinchDistance = first.distanceTo(second);
    if (state.previousPinchDistance > 0) {
      state.targetScale = clamp(
        state.targetScale - (pinchDistance - state.previousPinchDistance) * 1.9,
        0,
        MAX_SCALE
      );
    }
    state.previousPinchDistance = pinchDistance;
    return;
  }

  if (!state.isDragging) return;
  state.pointer.set(event.clientX, event.clientY);
  const movement = state.pointer.clone().sub(state.previousPointer);
  state.dragTarget.add(movement);
  if (reduceMotion) state.dragVelocity.set(0, 0);
  else state.dragVelocity.copy(movement).multiplyScalar(0.42);
  state.previousPointer.copy(state.pointer);
});

function endPointer(event) {
  activePointers.delete(event.pointerId);
  if (renderer.domElement.hasPointerCapture(event.pointerId)) {
    renderer.domElement.releasePointerCapture(event.pointerId);
  }

  state.previousPinchDistance = 0;
  if (activePointers.size === 1) {
    const remaining = [...activePointers.values()][0];
    state.isDragging = true;
    state.pointer.copy(remaining);
    state.previousPointer.copy(remaining);
    return;
  }

  state.isDragging = false;
  document.body.classList.remove('is-dragging');
}

renderer.domElement.addEventListener('pointerup', endPointer);
renderer.domElement.addEventListener('pointercancel', endPointer);

window.addEventListener('keydown', (event) => {
  const scaleSteps = {
    ArrowDown: 120,
    PageDown: 240,
    ArrowUp: -120,
    PageUp: -240
  };

  if (event.key in scaleSteps) {
    event.preventDefault();
    markInteracted();
    state.targetScale = clamp(state.targetScale + scaleSteps[event.key], 0, MAX_SCALE);
  } else if (event.key === 'Home') {
    state.targetScale = 18;
  } else if (event.key === 'End') {
    state.targetScale = MAX_SCALE;
  }
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  milkyWaySkyBand.resize(window.innerWidth, window.innerHeight);
});

window.__scaleBeyond = {
  maxScale: MAX_SCALE,
  setScale(value) {
    const nextScale = clamp(Number(value) || 0, 0, MAX_SCALE);
    state.scale = nextScale;
    state.targetScale = nextScale;
  },
  getState() {
    return {
      scale: state.scale,
      targetScale: state.targetScale,
      layer: layerName.textContent,
      assets: assetStatus.textContent,
      skyBandLoaded: milkyWaySkyBand.loaded,
      reducedMotion: reduceMotion
    };
  }
};

render();
