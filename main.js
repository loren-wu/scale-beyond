import * as THREE from 'three';

const container = document.getElementById('scene');
const layerName = document.getElementById('layerName');
const scaleUnit = document.getElementById('scaleUnit');
const captionZh = document.getElementById('captionZh');
const captionEn = document.getElementById('captionEn');
const hint = document.getElementById('hint');
const scaleBar = document.getElementById('scaleBar');

const EARTH_RADIUS = 8;
const MAX_SCALE = 800;

const state = {
  scale: 18,
  targetScale: 18,
  drag: new THREE.Vector2(0, 0),
  dragTarget: new THREE.Vector2(0, 0),
  dragVelocity: new THREE.Vector2(0, 0),
  pointer: new THREE.Vector2(0, 0),
  previousPointer: new THREE.Vector2(0, 0),
  isDragging: false,
  interacted: false
};

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

const earth = createEarth();
const clouds = createClouds();
const atmosphere = createAtmosphere();
planetGroup.add(earth, clouds, atmosphere);

const starField = createStarField();
world.add(starField);

const solarSystem = createSolarSystem();
solarGroup.add(solarSystem.root);

const targetLookAt = new THREE.Vector3();
const currentLookAt = new THREE.Vector3();
const targetPosition = new THREE.Vector3();
const currentPosition = new THREE.Vector3().copy(camera.position);

const copy = [
  {
    max: 55,
    layer: 'Planet Surface',
    unit: 'Low Earth orbit',
    zh: '你所看见的，只是其中一个尺度。',
    en: 'What you see is only one scale of reality.'
  },
  {
    max: 160,
    layer: 'Planet View',
    unit: '12,742 km',
    zh: '这里是你熟悉的一切。但它并不是全部。',
    en: 'This is everything familiar. But it is not everything.'
  },
  {
    max: MAX_SCALE + 1,
    layer: 'Earth-Moon System / Solar System',
    unit: '1 AU compressed',
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
  return new THREE.Line(geometry, material);
}

function createPlanet({ name, radius, distance, color, speed, inclination = 0 }) {
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
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.x = distance;
  mesh.userData.name = name;
  pivot.rotation.z = inclination;
  pivot.add(mesh);
  root.add(createOrbit(distance), pivot);
  return { root, pivot, mesh, speed };
}

function createSolarSystem() {
  const root = new THREE.Group();
  root.rotation.x = -0.34;
  root.position.set(30, -1.5, -8);

  const sunGeometry = new THREE.SphereGeometry(5.4, 64, 48);
  const sunMaterial = new THREE.MeshBasicMaterial({ color: 0xffd69a });
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
  root.add(sun, sunHalo, new THREE.PointLight(0xffdfb0, 230, 390, 1.5));

  const bodies = [
    createPlanet({ name: 'Mercury', radius: 0.42, distance: 11, color: 0xaaa19a, speed: 0.76, inclination: 0.02 }),
    createPlanet({ name: 'Venus', radius: 0.78, distance: 16, color: 0xd9b47a, speed: 0.48, inclination: -0.04 }),
    createPlanet({ name: 'Earth', radius: 0.88, distance: 22, color: 0x3f8dcc, speed: 0.34, inclination: 0.01 }),
    createPlanet({ name: 'Mars', radius: 0.58, distance: 29, color: 0xbb6547, speed: 0.25, inclination: 0.05 }),
    createPlanet({ name: 'Jupiter', radius: 2.1, distance: 40, color: 0xd3b28b, speed: 0.13, inclination: -0.02 }),
    createPlanet({ name: 'Saturn', radius: 1.78, distance: 53, color: 0xcab88c, speed: 0.09, inclination: 0.04 })
  ];

  bodies.forEach((body) => root.add(body.root));

  const moonPivot = new THREE.Group();
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(0.26, 32, 20),
    new THREE.MeshStandardMaterial({ color: 0xb9b8b1, roughness: 0.9 })
  );
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
  bodies[5].mesh.add(saturnRing);

  return { root, bodies, moonPivot, sunHalo };
}

function computeCamera(scale) {
  const tPlanet = smoothstep(0, 150, scale);
  const tSolar = smoothstep(120, MAX_SCALE, scale);
  const distance = mix(mix(10.2, 64, tPlanet), 230, tSolar);
  const fov = mix(mix(35, 45, tPlanet), 50, tSolar);
  const orbitAngle = -0.28 + state.drag.x * 0.0035;
  const elevation = 0.18 + state.drag.y * 0.0024;

  const centerX = mix(0, 18, tSolar);
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
  const solarFade = smoothstep(120, 310, scale);
  const planetScale = mix(1, 0.18, smoothstep(150, MAX_SCALE, scale));
  planetGroup.scale.setScalar(planetScale);
  planetGroup.position.x = mix(0, 22, solarFade);
  planetGroup.position.z = mix(0, -6, solarFade);

  earth.material.opacity = 1;
  clouds.material.opacity = mix(0.58, 0.34, solarFade);
  atmosphere.material.uniforms.intensity.value = mix(0.92, 0.42, solarFade);

  solarGroup.visible = scale > 84;
  solarGroup.traverse((object) => {
    if (!object.material || object === solarSystem.sunHalo) return;
    if ('opacity' in object.material) {
      object.material.transparent = true;
      object.material.opacity = clamp(solarFade, 0.05, 1);
    }
  });

  starField.material.opacity = mix(0.54, 0.88, smoothstep(50, MAX_SCALE, scale));
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
  starField.rotation.y += delta * 0.003;
  solarSystem.sunHalo.rotation.y += delta * 0.1;

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

window.addEventListener('pointerdown', (event) => {
  if (event.button !== 0) return;
  markInteracted();
  state.isDragging = true;
  state.pointer.set(event.clientX, event.clientY);
  state.previousPointer.copy(state.pointer);
  document.body.classList.add('is-dragging');
});

window.addEventListener('pointermove', (event) => {
  if (!state.isDragging) return;
  state.pointer.set(event.clientX, event.clientY);
  const movement = state.pointer.clone().sub(state.previousPointer);
  state.dragTarget.add(movement);
  state.dragVelocity.copy(movement).multiplyScalar(0.42);
  state.previousPointer.copy(state.pointer);
});

window.addEventListener('pointerup', () => {
  state.isDragging = false;
  document.body.classList.remove('is-dragging');
});

window.addEventListener('pointercancel', () => {
  state.isDragging = false;
  document.body.classList.remove('is-dragging');
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
});

render();
