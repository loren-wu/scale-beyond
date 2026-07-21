import * as THREE from 'three';

const container = document.getElementById('scene');
const layerName = document.getElementById('layerName');
const scaleUnit = document.getElementById('scaleUnit');
const captionZh = document.getElementById('captionZh');
const captionEn = document.getElementById('captionEn');
const hint = document.getElementById('hint');
const scaleBar = document.getElementById('scaleBar');
const distanceValue = document.getElementById('distanceValue');
const assetStatus = document.getElementById('assetStatus');

const EARTH_RADIUS = 8;
const MAX_SCALE = 800;

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

if (window.matchMedia('(pointer: coarse)').matches) {
  const [zoomHint, dragHint] = hint.querySelectorAll('span');
  zoomHint.textContent = '双指缩放';
  dragHint.textContent = '单指拖拽视角';
}

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x02040a, 0.0018);

const camera = new THREE.PerspectiveCamera(38, window.innerWidth / window.innerHeight, 0.05, 3000);
camera.position.set(0, 2, 16);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false,
  powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x02040a, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;
container.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const world = new THREE.Group();
const planetGroup = new THREE.Group();
const solarGroup = new THREE.Group();
scene.add(world, planetGroup, solarGroup);

const sunLight = new THREE.DirectionalLight(0xffffff, 4.6);
sunLight.position.set(-18, 8, 16);
scene.add(sunLight);
scene.add(new THREE.AmbientLight(0x9fb9d4, 0.08));

const textureAnisotropy = renderer.capabilities.getMaxAnisotropy();
const textureLoader = new THREE.TextureLoader();
textureLoader.setCrossOrigin('anonymous');

const earth = createEarth();
const clouds = createClouds();
const atmosphere = createAtmosphere();
const moonSystem = createMoonSystem();
planetGroup.add(earth, clouds, atmosphere, moonSystem.root);

const starField = createStarField();
const galaxyGlow = createGalaxyGlow();
world.add(starField, galaxyGlow);

const solarSystem = createSolarSystem();
solarGroup.add(solarSystem.root);

const targetLookAt = new THREE.Vector3();
const currentLookAt = new THREE.Vector3();
const targetPosition = new THREE.Vector3();
const currentPosition = new THREE.Vector3().copy(camera.position);

const copy = [
  {
    max: 70,
    layer: 'Planet Surface',
    unit: 'Low Earth orbit',
    zh: '你所看见的，只是其中一个尺度。',
    en: 'What you see is only one scale of reality.'
  },
  {
    max: 190,
    layer: 'Planet View',
    unit: '12,742 km',
    zh: '这里是你熟悉的一切。但它并不是全部。',
    en: 'This is everything familiar. But it is not everything.'
  },
  {
    max: 380,
    layer: 'Earth-Moon System',
    unit: '384,400 km',
    zh: '月球并不遥远。直到地球缩小之后，距离才显露出来。',
    en: 'The Moon feels close, until Earth becomes small enough for distance to appear.'
  },
  {
    max: MAX_SCALE + 1,
    layer: 'Solar System',
    unit: '1 AU · 149.6 million km',
    zh: '距离开始变得难以直觉理解。熟悉的世界，正在缩成一个光点。',
    en: 'Distance begins to escape intuition. The familiar world becomes a point of light.'
  }
];

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function mix(a, b, t) {
  return a + (b - a) * t;
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
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
    assetStatus.textContent = 'NASA IMAGERY · LOCAL';
  } else if (textureState.fallback > 0) {
    assetStatus.textContent = 'NASA IMAGERY · LOCAL + PROCEDURAL';
  } else {
    assetStatus.textContent = 'NASA IMAGERY · LOCAL + REMOTE';
  }
  assetStatus.classList.add('is-ready');
}

function applyTexture(material, sources, label, options = {}) {
  textureState.pending += 1;

  const attempt = (sourceIndex) => {
    textureLoader.load(
      sources[sourceIndex],
      (texture) => {
        configureTexture(texture);
        const previousMap = material.map;
        material.map = texture;
        if (options.useAsAlphaMap) {
          material.alphaMap = texture;
        }
        material.needsUpdate = true;

        if (previousMap?.isCanvasTexture) {
          previousMap.dispose();
        }

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

function createEarthTexture() {
  return makeCanvasTexture(2048, (ctx, width, height) => {
    const ocean = ctx.createLinearGradient(0, 0, width, height);
    ocean.addColorStop(0, '#0b2f57');
    ocean.addColorStop(0.44, '#123f69');
    ocean.addColorStop(1, '#07182e');
    ctx.fillStyle = ocean;
    ctx.fillRect(0, 0, width, height);

    const landColors = ['#3d6f52', '#5f7f55', '#8a805d', '#c6b885', '#314f3f'];
    for (let i = 0; i < 42; i += 1) {
      const x = Math.random() * width;
      const y = height * (0.16 + Math.random() * 0.68);
      const radiusX = width * (0.035 + Math.random() * 0.12);
      const radiusY = height * (0.025 + Math.random() * 0.12);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((Math.random() - 0.5) * 1.4);
      ctx.beginPath();
      ctx.ellipse(0, 0, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fillStyle = landColors[Math.floor(Math.random() * landColors.length)];
      ctx.globalAlpha = 0.5 + Math.random() * 0.38;
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = '#d8e1df';
    ctx.fillRect(0, 0, width, height * 0.07);
    ctx.fillRect(0, height * 0.93, width, height * 0.07);

    for (let i = 0; i < 110; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const length = width * (0.025 + Math.random() * 0.08);
      ctx.strokeStyle = `rgba(210, 225, 220, ${0.08 + Math.random() * 0.13})`;
      ctx.lineWidth = 1 + Math.random() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(x + length * 0.35, y - 20, x + length * 0.65, y + 16, x + length, y);
      ctx.stroke();
    }
  });
}

function createCloudTexture() {
  return makeCanvasTexture(1536, (ctx, width, height) => {
    ctx.clearRect(0, 0, width, height);
    for (let i = 0; i < 240; i += 1) {
      const x = Math.random() * width;
      const y = Math.random() * height;
      const length = width * (0.025 + Math.random() * 0.09);
      const alpha = 0.08 + Math.random() * 0.28;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, length);
      gradient.addColorStop(0, `rgba(255,255,255,${alpha})`);
      gradient.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.ellipse(x, y, length, length * (0.16 + Math.random() * 0.28), (Math.random() - 0.5) * 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function createEarth() {
  const geometry = new THREE.SphereGeometry(EARTH_RADIUS, 128, 96);
  const material = new THREE.MeshStandardMaterial({
    map: createEarthTexture(),
    roughness: 0.82,
    metalness: 0,
    color: 0xffffff
  });
  applyTexture(material, TEXTURE_SOURCES.earth, 'Blue Marble Earth');
  return new THREE.Mesh(geometry, material);
}

function createClouds() {
  const geometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.012, 128, 96);
  const material = new THREE.MeshStandardMaterial({
    map: createCloudTexture(),
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
    roughness: 1
  });
  applyTexture(material, TEXTURE_SOURCES.clouds, 'Blue Marble Clouds', { useAsAlphaMap: true });
  return new THREE.Mesh(geometry, material);
}

function createAtmosphere() {
  const geometry = new THREE.SphereGeometry(EARTH_RADIUS * 1.055, 128, 96);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    blending: THREE.AdditiveBlending,
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: {
      glowColor: { value: new THREE.Color(0x7fbfff) },
      intensity: { value: 0.92 }
    },
    vertexShader: `
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vNormal = normalize(normalMatrix * normal);
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldPosition = worldPosition.xyz;
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform vec3 glowColor;
      uniform float intensity;
      varying vec3 vNormal;
      varying vec3 vWorldPosition;

      void main() {
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float rim = pow(1.0 - max(dot(vNormal, viewDirection), 0.0), 2.4);
        gl_FragColor = vec4(glowColor, rim * intensity);
      }
    `
  });
  return new THREE.Mesh(geometry, material);
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
    depthTest: false
  });
  const sprite = new THREE.Sprite(material);
  sprite.position.set(-280, 110, -980);
  sprite.scale.set(1250, 310, 1);
  return sprite;
}

function createStarField() {
  const count = window.innerWidth < 760 ? 4500 : 9000;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const radius = 520 + Math.random() * 1150;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = radius * Math.cos(phi);
    positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);

    color.setHSL(0.56 + Math.random() * 0.08, 0.12, 0.62 + Math.random() * 0.28);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
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
  for (let i = 0; i <= segments; i += 1) {
    const angle = (i / segments) * Math.PI * 2;
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

function createAsteroidBelt(innerRadius, outerRadius) {
  const count = window.innerWidth < 760 ? 450 : 900;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const radius = mix(innerRadius, outerRadius, Math.random());
    positions[i * 3] = Math.cos(angle) * radius;
    positions[i * 3 + 1] = (Math.random() - 0.5) * 1.15;
    positions[i * 3 + 2] = Math.sin(angle) * radius;
    color.setHSL(0.09, 0.08, 0.42 + Math.random() * 0.25);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
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

function createPlanet({ name, radius, distance, color, speed, inclination = 0, axialTilt = 0, textureSources = null }) {
  const root = new THREE.Group();
  const pivot = new THREE.Group();
  const geometry = new THREE.SphereGeometry(radius, 48, 32);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.74,
    metalness: 0,
    emissive: color,
    emissiveIntensity: 0.015
  });
  if (textureSources) {
    applyTexture(material, textureSources, name);
  }
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.x = distance;
  mesh.rotation.z = axialTilt;
  mesh.userData.name = name;
  pivot.rotation.z = inclination;
  pivot.add(mesh);
  root.add(createOrbit(distance), pivot);
  return { root, pivot, mesh, speed };
}

function createSolarSystem() {
  const root = new THREE.Group();
  root.rotation.x = -0.34;
  root.position.set(18, -1.5, -8);

  const sunGeometry = new THREE.SphereGeometry(5.4, 64, 48);
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffd39a });
  const sun = new THREE.Mesh(sunGeometry, sunMaterial);
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

  const coronaTexture = createCoronaTexture();
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: coronaTexture,
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
    createPlanet({ name: 'Mercury', radius: 0.42, distance: 10, color: 0xaaa19a, speed: 0.76, inclination: 0.02, axialTilt: 0.01 }),
    createPlanet({ name: 'Venus', radius: 0.78, distance: 15, color: 0xd9b47a, speed: 0.48, inclination: -0.04, axialTilt: 0.05 }),
    createPlanet({ name: 'Earth', radius: 0.88, distance: 21, color: 0x3f8dcc, speed: 0.34, inclination: 0.01, axialTilt: 0.41, textureSources: TEXTURE_SOURCES.earth }),
    createPlanet({ name: 'Mars', radius: 0.58, distance: 28, color: 0xbb6547, speed: 0.25, inclination: 0.05, axialTilt: 0.44 }),
    createPlanet({ name: 'Jupiter', radius: 2.1, distance: 39, color: 0xd3b28b, speed: 0.13, inclination: -0.02, axialTilt: 0.05 }),
    createPlanet({ name: 'Saturn', radius: 1.78, distance: 52, color: 0xcab88c, speed: 0.09, inclination: 0.04, axialTilt: 0.47 }),
    createPlanet({ name: 'Uranus', radius: 1.22, distance: 65, color: 0x91c9ce, speed: 0.062, inclination: -0.03, axialTilt: 1.71 }),
    createPlanet({ name: 'Neptune', radius: 1.18, distance: 77, color: 0x4f74bb, speed: 0.048, inclination: 0.035, axialTilt: 0.49 })
  ];

  bodies.forEach((body) => root.add(body.root));

  const moonPivot = new THREE.Group();
  const moonMaterial = new THREE.MeshStandardMaterial({ color: 0xb9b8b1, roughness: 0.9 });
  applyTexture(moonMaterial, TEXTURE_SOURCES.moon, 'LROC Moon');
  const moon = new THREE.Mesh(new THREE.SphereGeometry(0.26, 32, 20), moonMaterial);
  moon.position.x = 1.85;
  moonPivot.add(createOrbit(1.85, 0xbfc7cf), moon);
  bodies[2].mesh.add(moonPivot);

  const saturnRing = new THREE.Mesh(
    new THREE.RingGeometry(2.22, 3.25, 96),
    new THREE.MeshBasicMaterial({
      color: 0xd8cba5,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false
    })
  );
  saturnRing.rotation.x = Math.PI / 2.7;
  saturnRing.userData.baseOpacity = 0.42;
  bodies[5].mesh.add(saturnRing);

  const asteroidBelt = createAsteroidBelt(32.5, 35.5);
  root.add(asteroidBelt);

  return { root, bodies, moonPivot, sunHalo, corona, asteroidBelt, solarLight };
}

function computeCamera(scale) {
  const tPlanet = smoothstep(0, 190, scale);
  const tMoon = smoothstep(130, 360, scale);
  const tSolar = smoothstep(300, MAX_SCALE, scale);
  const distance = mix(mix(10.2, 78, tPlanet), 215, tSolar);
  const fov = mix(mix(35, 42, tPlanet), 48, tSolar);
  const orbitAngle = -0.28 + state.drag.x * 0.0035;
  const elevation = 0.18 + state.drag.y * 0.0024;

  const centerX = mix(mix(0, 14, tMoon), 18, tSolar);
  targetLookAt.set(centerX + state.drag.x * 0.024, state.drag.y * 0.018, -8 * tSolar);

  targetPosition.set(
    targetLookAt.x + Math.sin(orbitAngle) * distance,
    targetLookAt.y + Math.sin(elevation) * distance + mix(1.5, 16, tSolar),
    targetLookAt.z + Math.cos(orbitAngle) * distance
  );

  camera.fov += (fov - camera.fov) * 0.055;
  camera.updateProjectionMatrix();
}

function updateVisibility(scale) {
  const moonFade = smoothstep(135, 225, scale) * (1 - smoothstep(370, 520, scale));
  const mainPlanetFade = 1 - smoothstep(390, 540, scale);
  const solarFade = smoothstep(330, 520, scale);
  const planetScale = mix(1, 0.45, smoothstep(115, 360, scale));
  planetGroup.scale.setScalar(planetScale);
  planetGroup.visible = mainPlanetFade > 0.01;

  earth.material.transparent = true;
  earth.material.opacity = mainPlanetFade;
  clouds.material.opacity = 0.55 * mainPlanetFade;
  atmosphere.material.uniforms.intensity.value = 0.92 * mainPlanetFade;

  moonSystem.root.visible = moonFade > 0.01;
  moonSystem.moon.material.transparent = true;
  moonSystem.moon.material.opacity = moonFade;
  moonSystem.root.children[0].material.opacity = 0.16 * moonFade;

  solarGroup.visible = solarFade > 0.001;
  solarGroup.traverse((object) => {
    if (!object.material) return;
    if ('opacity' in object.material) {
      object.material.transparent = true;
      object.material.opacity = (object.userData.baseOpacity ?? 1) * solarFade;
    }
  });
  solarSystem.solarLight.intensity = 245 * solarFade;

  starField.material.opacity = mix(0.54, 0.88, smoothstep(50, MAX_SCALE, scale));
  galaxyGlow.material.opacity = mix(0.08, 0.2, smoothstep(180, MAX_SCALE, scale));
  scaleBar.style.transform = `scaleX(${clamp(scale / MAX_SCALE, 0, 1).toFixed(4)})`;
}

function updateCopy(scale) {
  const active = copy.find((item) => scale <= item.max) || copy[copy.length - 1];
  if (layerName.textContent !== active.layer) {
    layerName.textContent = active.layer;
    scaleUnit.textContent = active.unit;
    captionZh.textContent = active.zh;
    captionEn.textContent = active.en;
  }

  if (scale <= 70) {
    const altitude = Math.round(mix(120, 2000, scale / 70));
    distanceValue.textContent = `${altitude.toLocaleString('en-US')} km above Earth`;
  } else if (scale <= 190) {
    distanceValue.textContent = 'EARTH DIAMETER · 12,742 KM';
  } else if (scale <= 380) {
    const lunarDistance = Math.round(mix(38, 384, (scale - 190) / 190));
    distanceValue.textContent = `${lunarDistance.toLocaleString('en-US')},000 km to Moon`;
  } else {
    const au = mix(0.08, 1, (scale - 380) / (MAX_SCALE - 380));
    distanceValue.textContent = `${au.toFixed(2)} AU · COMPRESSED VIEW`;
  }
}

function updateInteractions() {
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
  earth.rotation.y += delta * 0.038;
  clouds.rotation.y += delta * 0.064;
  atmosphere.rotation.y += delta * 0.018;
  moonSystem.pivot.rotation.y += delta * 0.055;
  moonSystem.moon.rotation.y += delta * 0.06;
  starField.rotation.y += delta * 0.003;
  solarSystem.sunHalo.rotation.y += delta * 0.1;
  solarSystem.asteroidBelt.rotation.y += delta * 0.008;

  const coronaSize = 25 + Math.sin(clock.elapsedTime * 0.75) * 0.7;
  solarSystem.corona.scale.set(coronaSize, coronaSize, 1);

  solarSystem.bodies.forEach((body) => {
    body.pivot.rotation.y += delta * body.speed;
    body.mesh.rotation.y += delta * 0.2;
  });
  solarSystem.moonPivot.rotation.y += delta * 0.82;
}

function render() {
  const delta = Math.min(clock.getDelta(), 0.033);
  updateInteractions();
  computeCamera(state.scale);
  updateVisibility(state.scale);
  updateCopy(state.scale);
  animateBodies(delta);

  currentPosition.lerp(targetPosition, 0.055);
  currentLookAt.lerp(targetLookAt, 0.065);
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
  state.targetScale = clamp(state.targetScale + event.deltaY * 0.42, 0, MAX_SCALE);
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
        state.targetScale - (pinchDistance - state.previousPinchDistance) * 1.15,
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
  state.dragVelocity.copy(movement).multiplyScalar(0.42);
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
    ArrowDown: 70,
    PageDown: 120,
    ArrowUp: -70,
    PageUp: -120
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
});

render();
