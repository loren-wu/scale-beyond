import * as THREE from 'three';

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

function gaussian(random) {
  const u = Math.max(random(), 0.0001);
  const v = Math.max(random(), 0.0001);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(256, 256, 0, 256, 256, 250);
  gradient.addColorStop(0, 'rgba(255,246,216,1)');
  gradient.addColorStop(0.1, 'rgba(255,214,153,0.72)');
  gradient.addColorStop(0.32, 'rgba(170,190,255,0.24)');
  gradient.addColorStop(1, 'rgba(50,80,150,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 512, 512);
  return new THREE.CanvasTexture(canvas);
}

function createGalaxyLabel(text, width = 88) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(255, 210, 135, 1)';
  context.beginPath();
  context.arc(30, 64, 6, 0, Math.PI * 2);
  context.fill();
  context.fillStyle = 'rgba(236, 243, 255, 1)';
  context.font = '600 72px "Segoe UI", Arial, sans-serif';
  context.textBaseline = 'middle';
  context.fillText(text, 54, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  }));
  label.scale.set(width, width / 5.5, 1);
  label.renderOrder = 20;
  return label;
}

function tagMaterial(object, baseOpacity) {
  object.userData.baseOpacity = baseOpacity;
  object.material.transparent = true;
  object.material.opacity = 0;
  if (object.material.uniforms?.opacity) {
    object.material.uniforms.opacity.value = 0;
  }
  object.material.depthWrite = false;
  return object;
}

function createLuminousDisk(radius, arms, twist, coreColor, armColor) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      opacity: { value: 0 },
      coreColor: { value: new THREE.Color(coreColor) },
      armColor: { value: new THREE.Color(armColor) },
      arms: { value: arms },
      twist: { value: twist }
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
      uniform vec3 coreColor;
      uniform vec3 armColor;
      uniform float arms;
      uniform float twist;
      varying vec2 vUv;

      void main() {
        vec2 point = (vUv - 0.5) * 2.0;
        float radius = length(point);
        if (radius > 1.0) discard;

        float angle = atan(point.y, point.x);
        float spiralPhase = angle * arms - radius * twist;
        float spiral = 0.5 + 0.5 * cos(spiralPhase);
        float armBand = pow(spiral, 7.0) * smoothstep(0.08, 0.3, radius);
        float armFilament = pow(0.5 + 0.5 * cos(spiralPhase * 2.0 + radius * 8.0), 11.0);
        float feather = 1.0 - smoothstep(0.66, 1.0, radius);
        float disk = exp(-radius * 2.9) * 0.24;
        float core = exp(-radius * 10.0) * 1.55;
        float dustSpiral = pow(0.5 + 0.5 * cos(spiralPhase + 1.18), 13.0);
        float dustLane = 1.0 - dustSpiral * smoothstep(0.12, 0.48, radius) * 0.62;
        float alpha = (disk + armBand * 0.27 + armFilament * 0.035 + core) * feather * dustLane * opacity;
        vec3 color = mix(coreColor, armColor, smoothstep(0.08, 0.68, radius));
        color += armColor * armFilament * 0.1;
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
  const disk = tagMaterial(new THREE.Mesh(new THREE.CircleGeometry(radius, 128), material), 0.34);
  disk.rotation.x = -Math.PI / 2;
  disk.renderOrder = -2;
  return disk;
}

function createSpiralGalaxy({
  name,
  count,
  radius,
  thickness,
  arms,
  twist,
  seed,
  coreColor,
  armColor,
  accentColor,
  pointSize
}) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const core = new THREE.Color(coreColor);
  const arm = new THREE.Color(armColor);
  const accent = new THREE.Color(accentColor);
  const color = new THREE.Color();

  for (let i = 0; i < count; i += 1) {
    const radiusRatio = Math.pow(random(), 0.62);
    const radialDistance = radiusRatio * radius;
    const armIndex = i % arms;
    const diskStar = random() < 0.13;
    const scatter = gaussian(random) * (0.055 + radiusRatio * 0.145);
    const angle = diskStar
      ? random() * Math.PI * 2
      : (armIndex / arms) * Math.PI * 2 + radiusRatio * twist + scatter;

    let x = Math.cos(angle) * radialDistance;
    let z = Math.sin(angle) * radialDistance;
    if (radiusRatio < 0.22) {
      const barAngle = (random() - 0.5) * 0.32;
      const barLength = gaussian(random) * radius * 0.18;
      x = Math.cos(barAngle) * barLength;
      z = Math.sin(barAngle) * barLength * 0.34;
    }
    const y = gaussian(random) * thickness * (1 - radiusRatio * 0.72);

    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;

    color.copy(core).lerp(arm, Math.min(radiusRatio * 1.25, 1));
    if (random() < 0.075) color.lerp(accent, 0.72);
    const brightness = 0.48 + random() * 0.44;
    colors[i * 3] = color.r * brightness;
    colors[i * 3 + 1] = color.g * brightness;
    colors[i * 3 + 2] = color.b * brightness;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: pointSize,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  });
  const stars = tagMaterial(new THREE.Points(geometry, material), 0.92);
  const disk = createLuminousDisk(radius, arms, twist * 1.05, coreColor, armColor);

  const glow = tagMaterial(new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: coreColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })), 0.58);
  glow.scale.set(radius * 0.72, radius * 0.42, 1);

  const haloCount = Math.max(420, Math.floor(count * 0.055));
  const haloPositions = new Float32Array(haloCount * 3);
  for (let i = 0; i < haloCount; i += 1) {
    const haloRadius = radius * (0.45 + random() * 0.95);
    const theta = random() * Math.PI * 2;
    const phi = Math.acos(2 * random() - 1);
    haloPositions[i * 3] = haloRadius * Math.sin(phi) * Math.cos(theta);
    haloPositions[i * 3 + 1] = haloRadius * Math.cos(phi) * 0.42;
    haloPositions[i * 3 + 2] = haloRadius * Math.sin(phi) * Math.sin(theta);
  }
  const haloGeometry = new THREE.BufferGeometry();
  haloGeometry.setAttribute('position', new THREE.BufferAttribute(haloPositions, 3));
  const halo = tagMaterial(new THREE.Points(haloGeometry, new THREE.PointsMaterial({
    color: 0x9eb8e3,
    size: pointSize * 0.48,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })), 0.22);

  const regionCount = Math.max(180, Math.floor(count * 0.018));
  const regionPositions = new Float32Array(regionCount * 3);
  const regionColors = new Float32Array(regionCount * 3);
  for (let i = 0; i < regionCount; i += 1) {
    const radiusRatio = 0.16 + Math.pow(random(), 0.72) * 0.74;
    const radialDistance = radiusRatio * radius;
    const armIndex = i % arms;
    const angle = (armIndex / arms) * Math.PI * 2 + radiusRatio * twist + gaussian(random) * 0.075;
    regionPositions[i * 3] = Math.cos(angle) * radialDistance;
    regionPositions[i * 3 + 1] = gaussian(random) * thickness * 0.24;
    regionPositions[i * 3 + 2] = Math.sin(angle) * radialDistance;
    color.copy(random() > 0.38 ? accent : arm).multiplyScalar(0.78 + random() * 0.44);
    regionColors[i * 3] = color.r;
    regionColors[i * 3 + 1] = color.g;
    regionColors[i * 3 + 2] = color.b;
  }
  const regionGeometry = new THREE.BufferGeometry();
  regionGeometry.setAttribute('position', new THREE.BufferAttribute(regionPositions, 3));
  regionGeometry.setAttribute('color', new THREE.BufferAttribute(regionColors, 3));
  const starFormingRegions = tagMaterial(new THREE.Points(regionGeometry, new THREE.PointsMaterial({
    size: pointSize * 2.35,
    sizeAttenuation: true,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })), 0.48);

  const group = new THREE.Group();
  group.name = name;
  group.add(disk, stars, starFormingRegions, glow, halo);
  group.userData.disk = disk;
  group.userData.stars = stars;
  group.userData.glow = glow;
  group.userData.starFormingRegions = starFormingRegions;
  return group;
}

function createDwarfGalaxy(name, count, radius, seed, colorValue) {
  const random = seededRandom(seed);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(colorValue);
  for (let i = 0; i < count; i += 1) {
    positions[i * 3] = gaussian(random) * radius;
    positions[i * 3 + 1] = gaussian(random) * radius * 0.34;
    positions[i * 3 + 2] = gaussian(random) * radius * 0.7;
    const brightness = 0.5 + random() * 0.7;
    colors[i * 3] = base.r * brightness;
    colors[i * 3 + 1] = base.g * brightness;
    colors[i * 3 + 2] = base.b * brightness;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const points = tagMaterial(new THREE.Points(geometry, new THREE.PointsMaterial({
    size: 0.72,
    vertexColors: true,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })), 0.62);
  const group = new THREE.Group();
  group.name = name;
  group.add(points);
  return group;
}

function setOpacity(group, opacity) {
  group.traverse((object) => {
    if (!object.material) return;
    const nextOpacity = (object.userData.baseOpacity ?? 1) * opacity;
    if (object.material.uniforms?.opacity) {
      object.material.uniforms.opacity.value = nextOpacity;
    }
    if (typeof object.material.opacity === 'number') {
      object.material.opacity = nextOpacity;
    }
  });
}

export function createCosmicEnvironment(compact = false) {
  const root = new THREE.Group();
  root.position.set(0, 0, -60);

  const milkyWay = createSpiralGalaxy({
    name: 'Milky Way',
    count: compact ? 18000 : 52000,
    radius: 118,
    thickness: 5.2,
    arms: 4,
    twist: 4.8,
    seed: 412198,
    coreColor: 0xffb568,
    armColor: 0x6f9fe9,
    accentColor: 0xdf73c1,
    pointSize: compact ? 0.74 : 0.58
  });
  milkyWay.rotation.set(-0.12, 0.16, -0.12);

  const andromeda = createSpiralGalaxy({
    name: 'Andromeda Galaxy',
    count: compact ? 9000 : 28000,
    radius: 92,
    thickness: 4.2,
    arms: 2,
    twist: 4.1,
    seed: 773901,
    coreColor: 0xffe0b8,
    armColor: 0x9eb8ee,
    accentColor: 0xd8b1df,
    pointSize: compact ? 0.74 : 0.58
  });
  andromeda.position.set(330, 64, -175);
  andromeda.rotation.set(0.28, -0.46, 0.34);

  const triangulum = createSpiralGalaxy({
    name: 'Triangulum Galaxy',
    count: compact ? 3800 : 10500,
    radius: 40,
    thickness: 2.6,
    arms: 3,
    twist: 4.6,
    seed: 193381,
    coreColor: 0xffd7ad,
    armColor: 0x83b5f5,
    accentColor: 0xf1a5d2,
    pointSize: compact ? 0.68 : 0.5
  });
  triangulum.position.set(-235, -38, 205);
  triangulum.rotation.set(-0.12, 0.62, -0.38);

  const largeMagellanic = createDwarfGalaxy('Large Magellanic Cloud', compact ? 1600 : 4200, 12, 61573, 0xa8c4ff);
  largeMagellanic.position.set(-82, -30, 94);
  largeMagellanic.rotation.z = 0.4;
  const smallMagellanic = createDwarfGalaxy('Small Magellanic Cloud', compact ? 850 : 2300, 7, 84519, 0xc2d5ff);
  smallMagellanic.position.set(-108, -40, 115);

  const companionSpecs = [
    ['M32', 4.2, 91352, 0xffd9ac, [306, 55, -158]],
    ['M110', 6.2, 59173, 0xc4d2ef, [360, 70, -196]],
    ['Sagittarius Dwarf', 4.8, 71344, 0xd3b9de, [-35, -15, 28]],
    ['Fornax Dwarf', 5.6, 22491, 0xb2c9f2, [-128, -44, 104]],
    ['Sculptor Dwarf', 4.4, 86517, 0xc8d8f4, [-88, -68, 142]],
    ['NGC 6822', 6.8, 31887, 0x9fc8f2, [196, -38, 174]],
    ['IC 10', 5.2, 44821, 0xc3a8df, [268, 16, -90]],
    ['WLM', 4.9, 62915, 0xa9c8ef, [-354, -58, -132]]
  ];
  const dwarfCompanions = companionSpecs.map(([name, radius, seed, color, position], index) => {
    const dwarf = createDwarfGalaxy(name, compact ? 150 + index * 11 : 420 + index * 28, radius, seed, color);
    dwarf.position.set(...position);
    dwarf.rotation.set((index % 3) * 0.13, index * 0.29, (index % 2 ? -1 : 1) * 0.18);
    return dwarf;
  });

  const labels = [
    createGalaxyLabel('MILKY WAY · HOME', 112),
    createGalaxyLabel('ANDROMEDA · M31', 132),
    createGalaxyLabel('TRIANGULUM · M33', 134)
  ];
  labels[0].position.set(0, -34, 0);
  labels[1].position.set(330, 112, -175);
  labels[2].position.set(-235, -4, 205);
  if (compact) labels.forEach((label) => label.scale.multiplyScalar(0.72));
  const labelGroup = new THREE.Group();
  labelGroup.add(...labels);

  const solarMarker = tagMaterial(new THREE.Sprite(new THREE.SpriteMaterial({
    map: makeGlowTexture(),
    color: 0xffd17f,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false
  })), 0.88);
  solarMarker.scale.set(4.8, 4.8, 1);
  solarMarker.position.set(38, 0.5, 49);
  milkyWay.add(solarMarker);

  root.add(milkyWay, andromeda, triangulum, largeMagellanic, smallMagellanic, ...dwarfCompanions, labelGroup);
  root.visible = false;

  function update(delta, galaxyOpacity, localOpacity, motionEnabled = true) {
    root.visible = galaxyOpacity > 0.001;
    setOpacity(milkyWay, galaxyOpacity * (1 - localOpacity * 0.38));
    setOpacity(andromeda, localOpacity * 0.5);
    setOpacity(triangulum, localOpacity * 0.56);
    setOpacity(largeMagellanic, Math.max(galaxyOpacity * 0.08, localOpacity * 0.48));
    setOpacity(smallMagellanic, Math.max(galaxyOpacity * 0.06, localOpacity * 0.42));
    dwarfCompanions.forEach((dwarf, index) => {
      setOpacity(dwarf, localOpacity * (0.28 + (index % 3) * 0.055));
    });
    labels.forEach((label) => {
      label.material.opacity = 0.78 * localOpacity;
    });
    if (motionEnabled) {
      milkyWay.rotation.y += delta * 0.0022;
      andromeda.rotation.y -= delta * 0.0012;
      triangulum.rotation.y += delta * 0.0015;
    }
    const pulse = motionEnabled ? 0.76 + Math.sin(performance.now() * 0.0022) * 0.2 : 0.82;
    solarMarker.material.opacity = 0.88 * galaxyOpacity * pulse;
  }

  return {
    root,
    milkyWay,
    andromeda,
    triangulum,
    largeMagellanic,
    smallMagellanic,
    dwarfCompanions,
    solarMarker,
    labels,
    update
  };
}
