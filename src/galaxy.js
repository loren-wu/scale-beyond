import * as THREE from 'three';

const TAU = Math.PI * 2;

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
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function chooseWeighted(random, weights) {
  const total = weights.reduce((sum, value) => sum + value, 0);
  let cursor = random() * total;
  for (let index = 0; index < weights.length; index += 1) {
    cursor -= weights[index];
    if (cursor <= 0) return index;
  }
  return weights.length - 1;
}

function makeGlowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 126);
  gradient.addColorStop(0, 'rgba(255,247,224,0.96)');
  gradient.addColorStop(0.075, 'rgba(255,218,164,0.58)');
  gradient.addColorStop(0.27, 'rgba(174,190,230,0.18)');
  gradient.addColorStop(0.62, 'rgba(89,108,158,0.045)');
  gradient.addColorStop(1, 'rgba(20,28,48,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function createGalaxyLabel(text, width = 88) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 128;
  const context = canvas.getContext('2d');
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = 'rgba(255, 201, 121, 0.96)';
  context.beginPath();
  context.arc(30, 64, 5.5, 0, TAU);
  context.fill();
  context.fillStyle = 'rgba(230, 238, 252, 0.98)';
  context.font = '600 68px "Segoe UI", Arial, sans-serif';
  context.textBaseline = 'middle';
  context.fillText(text, 54, 64);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    depthTest: false,
    toneMapped: false
  });
  const label = new THREE.Sprite(material);
  label.scale.set(width, width / 5.5, 1);
  label.renderOrder = 20;
  return label;
}

function tagMaterial(object, baseOpacity) {
  object.userData.baseOpacity = baseOpacity;
  object.material.transparent = true;
  object.material.opacity = 0;
  if (object.material.uniforms?.opacity) object.material.uniforms.opacity.value = 0;
  object.material.depthWrite = false;
  return object;
}

function createStarPointMaterial(pointScale, maximumSize = 9) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      opacity: { value: 0 },
      pointScale: { value: pointScale },
      maximumSize: { value: maximumSize }
    },
    vertexShader: `
      uniform float pointScale;
      uniform float maximumSize;
      attribute float aSize;
      varying vec3 vColor;
      void main() {
        vColor = color;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        float perspective = 500.0 / max(70.0, -viewPosition.z);
        gl_PointSize = clamp(aSize * pointScale * perspective, 0.9, maximumSize);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec3 vColor;
      void main() {
        float distanceToCenter = length(gl_PointCoord - 0.5);
        if (distanceToCenter > 0.5) discard;
        float feather = 1.0 - smoothstep(0.08, 0.5, distanceToCenter);
        float core = pow(max(0.0, 1.0 - distanceToCenter * 2.0), 4.0);
        gl_FragColor = vec4(vColor * 1.24 + vec3(core * 0.24), (feather * 0.76 + core * 0.3) * opacity);
      }
    `,
    vertexColors: true
  });
  material.toneMapped = false;
  return material;
}

function createPointCloud({ positions, colors, sizes, baseOpacity, pointScale, maximumSize = 9, name }) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.computeBoundingSphere();
  const points = new THREE.Points(geometry, createStarPointMaterial(pointScale, maximumSize));
  points.name = name;
  return tagMaterial(points, baseOpacity);
}

function createLuminousDisk({
  radius,
  arms,
  twist,
  coreColor,
  armColor,
  accentColor,
  barStrength,
  irregularity,
  seed,
  compact
}) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: {
      opacity: { value: 0 },
      coreColor: { value: new THREE.Color(coreColor) },
      armColor: { value: new THREE.Color(armColor) },
      accentColor: { value: new THREE.Color(accentColor) },
      arms: { value: arms },
      twist: { value: twist },
      barStrength: { value: barStrength },
      irregularity: { value: irregularity },
      seedOffset: { value: (seed % 991) / 991 }
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
      uniform vec3 accentColor;
      uniform float arms;
      uniform float twist;
      uniform float barStrength;
      uniform float irregularity;
      uniform float seedOffset;
      varying vec2 vUv;

      float hash21(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += vec2(dot(point, point + vec2(45.32 + seedOffset * 17.0)));
        return fract(point.x * point.y);
      }

      float noise21(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float a = hash21(cell);
        float b = hash21(cell + vec2(1.0, 0.0));
        float c = hash21(cell + vec2(0.0, 1.0));
        float d = hash21(cell + vec2(1.0, 1.0));
        return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
      }

      void main() {
        vec2 point = (vUv - 0.5) * 2.0;
        float radial = length(point);
        if (radial > 1.0) discard;

        float angle = atan(point.y, point.x);
        float coarseNoise = noise21(point * 4.7 + vec2(seedOffset * 9.0));
        float fineNoise = noise21(point * 16.0 - vec2(seedOffset * 11.0));
        float warp = sin(angle * 3.0 + radial * 8.0 + seedOffset * 8.0) * irregularity;
        float phase = angle * arms - radial * twist + warp + (coarseNoise - 0.5) * irregularity * 1.8;
        float mainArm = pow(0.5 + 0.5 * cos(phase), 9.0);
        float branch = pow(0.5 + 0.5 * cos(phase * 2.0 + radial * 13.0 + fineNoise), 16.0);
        float armEnvelope = smoothstep(0.1, 0.28, radial) * (1.0 - smoothstep(0.72, 1.0, radial));
        float patchiness = mix(0.5, 1.0, coarseNoise) * mix(0.74, 1.0, fineNoise);

        float disk = exp(-radial * 3.0) * 0.22;
        float bulge = exp(-radial * 12.5) * 1.22;
        float barAngle = 0.43;
        mat2 barRotation = mat2(cos(barAngle), -sin(barAngle), sin(barAngle), cos(barAngle));
        vec2 barPoint = barRotation * point;
        float bar = exp(-pow(abs(barPoint.x) / 0.34, 1.55) - pow(abs(barPoint.y) / 0.075, 1.35));
        bar *= barStrength * (1.0 - smoothstep(0.18, 0.54, radial));

        float dustPhase = phase + 0.56 + irregularity * sin(radial * 17.0);
        float dustLane = pow(0.5 + 0.5 * cos(dustPhase), 18.0) * armEnvelope;
        float dustFragments = smoothstep(0.54, 0.8, noise21(point * 24.0 + vec2(7.0)));
        float transmission = 1.0 - dustLane * (0.55 + dustFragments * 0.27);

        float armsLight = (mainArm * 0.47 + branch * 0.12) * armEnvelope * patchiness;
        float feather = 1.0 - smoothstep(0.78, 1.0, radial);
        float alpha = (disk + bulge + bar + armsLight) * transmission * feather * opacity;
        vec3 color = mix(coreColor, armColor, smoothstep(0.1, 0.64, radial));
        color = mix(color, accentColor, branch * armEnvelope * 0.16);
        color *= mix(0.94, 1.24, fineNoise);
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
  material.toneMapped = false;
  const geometry = new THREE.CircleGeometry(radius, compact ? 80 : 144);
  const disk = new THREE.Mesh(geometry, material);
  disk.rotation.x = -Math.PI / 2;
  disk.renderOrder = -2;
  return tagMaterial(disk, 0.8);
}

function createHaloPopulation(config, random) {
  const diffuseCount = Math.max(config.compact ? 260 : 680, Math.floor(config.count * (config.compact ? 0.026 : 0.045)));
  const clusterCount = config.compact ? Math.max(18, Math.floor(config.radius * 0.22)) : Math.max(54, Math.floor(config.radius * 0.88));
  const clusterStars = config.compact ? 3 : 7;
  const total = diffuseCount + clusterCount * (clusterStars + 1);
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const sizes = new Float32Array(total);
  const haloColor = new THREE.Color(config.haloColor ?? 0x9cadcb);
  const clusterColor = new THREE.Color(config.clusterColor ?? 0xffd6a1);
  let cursor = 0;

  function writePoint(x, y, z, color, size, brightness = 1) {
    positions[cursor * 3] = x;
    positions[cursor * 3 + 1] = y;
    positions[cursor * 3 + 2] = z;
    colors[cursor * 3] = color.r * brightness;
    colors[cursor * 3 + 1] = color.g * brightness;
    colors[cursor * 3 + 2] = color.b * brightness;
    sizes[cursor] = size;
    cursor += 1;
  }

  for (let index = 0; index < diffuseCount; index += 1) {
    const shell = config.radius * (0.24 + Math.pow(random(), 0.74) * 1.22);
    const azimuth = random() * TAU;
    const polar = Math.acos(2 * random() - 1);
    const flattening = 0.62 + random() * 0.18;
    writePoint(
      shell * Math.sin(polar) * Math.cos(azimuth),
      shell * Math.cos(polar) * flattening,
      shell * Math.sin(polar) * Math.sin(azimuth),
      haloColor,
      config.pointSize * (0.46 + random() * 0.45),
      0.38 + random() * 0.48
    );
  }

  for (let cluster = 0; cluster < clusterCount; cluster += 1) {
    const shell = config.radius * (0.35 + Math.pow(random(), 0.78) * 0.78);
    const azimuth = random() * TAU;
    const polar = Math.acos(2 * random() - 1);
    const centerX = shell * Math.sin(polar) * Math.cos(azimuth);
    const centerY = shell * Math.cos(polar) * 0.7;
    const centerZ = shell * Math.sin(polar) * Math.sin(azimuth);
    writePoint(centerX, centerY, centerZ, clusterColor, config.pointSize * 2.7, 0.82 + random() * 0.34);
    for (let star = 0; star < clusterStars; star += 1) {
      const spread = config.radius * (0.0025 + random() * 0.006);
      writePoint(
        centerX + gaussian(random) * spread,
        centerY + gaussian(random) * spread,
        centerZ + gaussian(random) * spread,
        clusterColor,
        config.pointSize * (0.48 + random() * 0.55),
        0.48 + random() * 0.38
      );
    }
  }

  const halo = createPointCloud({
    positions,
    colors,
    sizes,
    baseOpacity: 0.24,
    pointScale: config.compact ? 1.32 : 1,
    maximumSize: config.compact ? 6.2 : 8,
    name: `${config.name} · stellar halo and globular clusters`
  });
  halo.userData.globularClusterCount = clusterCount;
  return halo;
}

function createSpiralGalaxy(config, glowTexture) {
  const random = seededRandom(config.seed);
  const positions = new Float32Array(config.count * 3);
  const colors = new Float32Array(config.count * 3);
  const sizes = new Float32Array(config.count);
  const core = new THREE.Color(config.coreColor);
  const arm = new THREE.Color(config.armColor);
  const accent = new THREE.Color(config.accentColor);
  const warmDisk = new THREE.Color(config.diskColor ?? 0xe8d6c0);
  const color = new THREE.Color();
  const armWeights = config.armWeights ?? Array.from({ length: config.arms }, (_, index) => 1 + Math.sin(index * 2.17) * 0.15);
  let starFormingCount = 0;
  let thickDiskCount = 0;
  let barCount = 0;

  for (let index = 0; index < config.count; index += 1) {
    const isBulge = random() < config.bulgeFraction;
    let x;
    let y;
    let z;
    let radialRatio;
    let isStarForming = false;

    if (isBulge) {
      radialRatio = Math.min(0.34, Math.abs(gaussian(random)) * 0.095);
      if (random() < config.barStrength) {
        const alongBar = clamp(gaussian(random), -2.7, 2.7) * config.radius * 0.095;
        const acrossBar = gaussian(random) * config.radius * (0.018 + (1 - config.barStrength) * 0.012);
        const angle = 0.43 + gaussian(random) * 0.045;
        x = alongBar * Math.cos(angle) - acrossBar * Math.sin(angle);
        z = alongBar * Math.sin(angle) + acrossBar * Math.cos(angle);
        y = gaussian(random) * config.thickness * 0.38;
        barCount += 1;
      } else {
        x = gaussian(random) * config.radius * 0.085;
        y = gaussian(random) * config.thickness * 0.74;
        z = gaussian(random) * config.radius * 0.07;
      }
    } else {
      radialRatio = 0.075 + Math.pow(random(), config.radialPower ?? 0.68) * 0.91;
      const starFormationCandidate = random() < config.starFormationRate;
      if (starFormationCandidate && config.starFormationRing) {
        radialRatio = clamp(config.starFormationRing + gaussian(random) * 0.095, 0.18, 0.94);
      }
      const radialDistance = radialRatio * config.radius * (1 + gaussian(random) * 0.018);
      const isDiskStar = random() < config.diskFraction;
      let angle;
      if (isDiskStar) {
        angle = random() * TAU;
      } else {
        const armIndex = chooseWeighted(random, armWeights);
        const armBase = (armIndex / config.arms) * TAU;
        const armWidth = config.armScatter * (0.52 + radialRatio * 0.9);
        const branchOffset = random() < config.flocculence * 0.32
          ? (random() > 0.5 ? 1 : -1) * (0.2 + random() * 0.34)
          : 0;
        angle = armBase
          + radialRatio * config.twist
          + Math.sin(radialRatio * 10.0 + armIndex * 1.77) * config.irregularity * 0.22
          + branchOffset
          + gaussian(random) * armWidth;
      }
      const asymmetry = 1 + config.asymmetry * Math.sin(angle - 0.8) * (0.3 + radialRatio * 0.7);
      x = Math.cos(angle) * radialDistance * asymmetry;
      z = Math.sin(angle) * radialDistance;
      const isThickDisk = random() < config.thickDiskFraction;
      const verticalScale = isThickDisk ? 0.95 : 0.28;
      y = gaussian(random) * config.thickness * verticalScale * (1 - radialRatio * 0.52);
      if (isThickDisk) thickDiskCount += 1;
      isStarForming = starFormationCandidate && !isDiskStar;
    }

    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;

    if (isBulge) {
      color.copy(core).lerp(warmDisk, random() * 0.3);
    } else {
      color.copy(warmDisk).lerp(arm, Math.min(1, radialRatio * 1.18));
    }
    if (isStarForming) {
      color.lerp(random() < 0.58 ? accent : arm, 0.78);
      sizes[index] = config.pointSize * (1.7 + random() * 2.25);
      starFormingCount += 1;
    } else {
      sizes[index] = config.pointSize * (0.56 + random() * 1.05);
    }
    const brightness = isBulge ? 0.65 + random() * 0.46 : 0.42 + random() * 0.62;
    colors[index * 3] = color.r * brightness;
    colors[index * 3 + 1] = color.g * brightness;
    colors[index * 3 + 2] = color.b * brightness;
  }

  const disk = createLuminousDisk({ ...config, compact: config.compact });
  const stars = createPointCloud({
    positions,
    colors,
    sizes,
    baseOpacity: 0.94,
    pointScale: config.compact ? 1.48 : 1.16,
    maximumSize: config.compact ? 7.2 : 9.5,
    name: `${config.name} · thin disk, thick disk and star-forming regions`
  });
  const halo = config.includeHalo === false ? null : createHaloPopulation(config, random);

  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: config.coreColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  });
  const glow = config.includeGlow === false ? null : tagMaterial(new THREE.Sprite(glowMaterial), 0.34);
  if (glow) glow.scale.set(config.radius * 0.68, config.radius * 0.38, 1);

  const group = new THREE.Group();
  group.name = config.name;
  group.add(disk, stars);
  if (halo) group.add(halo);
  if (glow) group.add(glow);
  group.userData.disk = disk;
  group.userData.stars = stars;
  group.userData.glow = glow;
  group.userData.halo = halo;
  group.userData.starFormingRegions = stars;
  group.userData.structure = {
    arms: config.arms,
    barStars: barCount,
    thickDiskStars: thickDiskCount,
    starFormingRegions: starFormingCount,
    globularClusters: halo?.userData.globularClusterCount ?? 0
  };
  return group;
}

function createDwarfGalaxy(spec, compact, glowTexture) {
  const random = seededRandom(spec.seed);
  const positions = new Float32Array(spec.count * 3);
  const colors = new Float32Array(spec.count * 3);
  const sizes = new Float32Array(spec.count);
  const oldColor = new THREE.Color(spec.color);
  const youngColor = new THREE.Color(spec.youngColor ?? 0x8fc5ff);
  const warmColor = new THREE.Color(spec.warmColor ?? 0xffd2a2);
  const color = new THREE.Color();
  const morphology = spec.morphology;

  for (let index = 0; index < spec.count; index += 1) {
    let x;
    let y;
    let z;
    let young = false;
    const radius = spec.radius;

    if (morphology === 'compact-elliptical') {
      const concentration = Math.pow(random(), 1.8);
      const scale = radius * (0.12 + concentration * 0.88);
      x = gaussian(random) * scale * 0.64;
      y = gaussian(random) * scale * 0.25;
      z = gaussian(random) * scale * 0.46;
    } else if (morphology === 'dwarf-spheroidal') {
      const scale = radius * (0.35 + random() * 0.65);
      x = gaussian(random) * scale * 0.72;
      y = gaussian(random) * scale * 0.42;
      z = gaussian(random) * scale * 0.62;
    } else if (morphology === 'ultra-diffuse') {
      const scale = radius * (0.62 + random() * 0.74);
      x = gaussian(random) * scale;
      y = gaussian(random) * scale * 0.34;
      z = gaussian(random) * scale * 0.78;
    } else if (morphology === 'magellanic') {
      if (random() < 0.52) {
        const alongBar = gaussian(random) * radius * 0.58;
        const acrossBar = gaussian(random) * radius * 0.16;
        x = alongBar * 0.9 - acrossBar * 0.42;
        z = alongBar * 0.42 + acrossBar * 0.9;
        y = gaussian(random) * radius * 0.13;
      } else {
        const clump = Math.floor(random() * 4);
        const offsets = [[-0.35, 0.1], [0.08, -0.18], [0.42, 0.2], [0.68, -0.1]];
        x = (offsets[clump][0] + gaussian(random) * 0.2) * radius;
        z = (offsets[clump][1] + gaussian(random) * 0.15) * radius;
        y = gaussian(random) * radius * 0.15;
      }
      young = random() < 0.22;
    } else {
      const clump = Math.floor(random() * 3);
      const offsets = [[-0.42, 0.18], [0.1, -0.22], [0.48, 0.16]];
      const spread = clump === 1 ? 0.24 : 0.17;
      x = (offsets[clump][0] + gaussian(random) * spread) * radius;
      z = (offsets[clump][1] + gaussian(random) * spread * 0.78) * radius;
      y = gaussian(random) * radius * 0.2;
      if (random() < 0.08) {
        x += (random() - 0.2) * radius * 1.15;
        z += gaussian(random) * radius * 0.18;
      }
      young = random() < 0.18;
    }

    positions[index * 3] = x;
    positions[index * 3 + 1] = y;
    positions[index * 3 + 2] = z;
    color.copy(oldColor);
    if (young) color.lerp(random() < 0.58 ? youngColor : warmColor, 0.78);
    const surfaceBrightness = morphology === 'ultra-diffuse' ? 0.48 : 0.68;
    const brightness = surfaceBrightness * (0.56 + random() * 0.66);
    colors[index * 3] = color.r * brightness;
    colors[index * 3 + 1] = color.g * brightness;
    colors[index * 3 + 2] = color.b * brightness;
    sizes[index] = spec.pointSize * (young ? 1.65 + random() * 1.8 : 0.58 + random() * 0.86);
  }

  const points = createPointCloud({
    positions,
    colors,
    sizes,
    baseOpacity: morphology === 'ultra-diffuse' ? 0.38 : 0.66,
    pointScale: compact ? 1.52 : 1.18,
    maximumSize: compact ? 6.2 : 7.6,
    name: `${spec.name} · ${morphology}`
  });
  const group = new THREE.Group();
  group.name = spec.name;
  group.userData.morphology = morphology;
  group.add(points);
  if (spec.diffuseGlow && !compact) {
    const glow = tagMaterial(new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTexture,
      color: spec.color,
      transparent: true,
      opacity: 0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      toneMapped: false
    })), morphology === 'ultra-diffuse' ? 0.17 : 0.32);
    glow.scale.set(spec.radius * 2.3, spec.radius * 1.16, 1);
    group.add(glow);
  }
  return group;
}

function createDistantGalaxyField(compact, seed) {
  const random = seededRandom(seed);
  const count = compact ? 720 : 3200;
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const angles = new Float32Array(count);
  const aspects = new Float32Array(count);
  const morphologies = new Float32Array(count);
  const alphas = new Float32Array(count);
  const warm = new THREE.Color(0xe9c6a5);
  const neutral = new THREE.Color(0xb9c7dc);
  const blue = new THREE.Color(0x86abd9);
  const color = new THREE.Color();

  for (let index = 0; index < count; index += 1) {
    const distance = 980 + Math.pow(random(), 0.58) * 4300;
    const azimuth = random() * TAU;
    const polar = Math.acos(2 * random() - 1);
    positions[index * 3] = distance * Math.sin(polar) * Math.cos(azimuth);
    positions[index * 3 + 1] = distance * Math.cos(polar) * 0.82;
    positions[index * 3 + 2] = distance * Math.sin(polar) * Math.sin(azimuth);
    const kind = random();
    morphologies[index] = kind;
    color.copy(kind < 0.34 ? warm : kind < 0.78 ? neutral : blue);
    color.multiplyScalar(0.56 + random() * 0.46);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    sizes[index] = compact ? 8 + random() * 17 : 9 + random() * 22;
    angles[index] = random() * TAU;
    aspects[index] = kind < 0.34 ? 1.1 + random() * 1.2 : 1.5 + random() * 2.6;
    alphas[index] = 0.34 + random() * 0.62;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
  geometry.setAttribute('aAspect', new THREE.BufferAttribute(aspects, 1));
  geometry.setAttribute('aMorphology', new THREE.BufferAttribute(morphologies, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexColors: true,
    uniforms: {
      opacity: { value: 0 },
      compactBoost: { value: compact ? 1.22 : 1 }
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAngle;
      attribute float aAspect;
      attribute float aMorphology;
      attribute float aAlpha;
      uniform float compactBoost;
      varying vec3 vColor;
      varying float vAngle;
      varying float vAspect;
      varying float vMorphology;
      varying float vAlpha;
      void main() {
        vColor = color;
        vAngle = aAngle;
        vAspect = aAspect;
        vMorphology = aMorphology;
        vAlpha = aAlpha;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * compactBoost * (850.0 / max(500.0, -viewPosition.z)), 2.0, 17.0);
        gl_Position = projectionMatrix * viewPosition;
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec3 vColor;
      varying float vAngle;
      varying float vAspect;
      varying float vMorphology;
      varying float vAlpha;
      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float cosine = cos(vAngle);
        float sine = sin(vAngle);
        point = mat2(cosine, -sine, sine, cosine) * point;
        point.y *= vAspect;
        float radial = length(point) * 2.0;
        if (radial > 1.0) discard;
        float profile = exp(-radial * (vMorphology < 0.34 ? 4.6 : 3.2));
        float armHint = 0.72 + 0.28 * cos(atan(point.y, point.x) * 2.0 - radial * 7.0);
        float spiralMix = smoothstep(0.34, 0.72, vMorphology);
        profile *= mix(1.0, armHint, spiralMix * 0.55);
        float core = exp(-radial * 12.0);
        float edge = 1.0 - smoothstep(0.72, 1.0, radial);
        gl_FragColor = vec4(vColor + core * vec3(0.16, 0.12, 0.08), (profile + core * 0.36) * edge * vAlpha * opacity);
      }
    `
  });
  material.toneMapped = false;
  const field = new THREE.Points(geometry, material);
  field.name = 'Deep galaxy field · mixed morphology';
  field.frustumCulled = false;
  field.userData.galaxyCount = count;
  return tagMaterial(field, 0.66);
}

function setOpacity(group, opacity) {
  group.traverse((object) => {
    if (!object.material) return;
    const nextOpacity = (object.userData.baseOpacity ?? 1) * opacity;
    if (object.material.uniforms?.opacity) object.material.uniforms.opacity.value = nextOpacity;
    if (typeof object.material.opacity === 'number') object.material.opacity = nextOpacity;
  });
}

function disposeObject(root) {
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse((object) => {
    if (object.geometry) geometries.add(object.geometry);
    if (!object.material) return;
    const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
    objectMaterials.forEach((material) => {
      materials.add(material);
      Object.values(material).forEach((value) => {
        if (value?.isTexture) textures.add(value);
      });
    });
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((material) => material.dispose());
  textures.forEach((texture) => texture.dispose());
}

export function createCosmicEnvironment(compact = false) {
  const root = new THREE.Group();
  root.name = 'Milky Way and Local Group';
  root.position.set(0, 0, -60);
  const glowTexture = makeGlowTexture();

  const milkyWay = createSpiralGalaxy({
    name: 'Milky Way',
    count: compact ? 18000 : 68000,
    radius: 118,
    thickness: 5.6,
    arms: 4,
    armWeights: [1, 0.76, 0.92, 0.64],
    twist: 5.05,
    seed: 412198,
    coreColor: 0xffb66f,
    diskColor: 0xe7d1bc,
    armColor: 0x7ea6dd,
    accentColor: 0xdf7dae,
    haloColor: 0x8d9db8,
    clusterColor: 0xffd091,
    pointSize: compact ? 1.02 : 0.88,
    barStrength: 0.86,
    bulgeFraction: 0.185,
    diskFraction: 0.25,
    thickDiskFraction: 0.15,
    starFormationRate: 0.105,
    armScatter: 0.115,
    irregularity: 0.58,
    flocculence: 0.35,
    asymmetry: 0.07,
    compact,
    includeHalo: true,
    includeGlow: true
  }, glowTexture);
  milkyWay.rotation.set(-0.12, 0.16, -0.12);

  const andromeda = createSpiralGalaxy({
    name: 'Andromeda Galaxy',
    count: compact ? 8200 : 36000,
    radius: 96,
    thickness: 4.6,
    arms: 2,
    armWeights: [1, 0.86],
    twist: 3.72,
    seed: 773901,
    coreColor: 0xffddb4,
    diskColor: 0xe3d2c5,
    armColor: 0x9aafd3,
    accentColor: 0xc8a1c6,
    haloColor: 0x9ca7b8,
    clusterColor: 0xffd6a8,
    pointSize: compact ? 0.98 : 0.82,
    barStrength: 0.22,
    bulgeFraction: 0.27,
    diskFraction: 0.36,
    thickDiskFraction: 0.18,
    starFormationRate: 0.072,
    starFormationRing: 0.58,
    armScatter: 0.19,
    irregularity: 0.26,
    flocculence: 0.12,
    asymmetry: 0.08,
    compact,
    includeHalo: !compact,
    includeGlow: true
  }, glowTexture);
  andromeda.position.set(330, 64, -175);
  andromeda.rotation.set(0.28, -0.46, 0.34);

  const triangulum = createSpiralGalaxy({
    name: 'Triangulum Galaxy',
    count: compact ? 3900 : 16500,
    radius: 42,
    thickness: 2.9,
    arms: 3,
    armWeights: [1, 0.72, 0.52],
    twist: 5.35,
    seed: 193381,
    coreColor: 0xffd4a6,
    diskColor: 0xd8d1c5,
    armColor: 0x78aee6,
    accentColor: 0xf08fbd,
    haloColor: 0x8699b4,
    clusterColor: 0xf6c994,
    pointSize: compact ? 0.91 : 0.72,
    barStrength: 0.035,
    bulgeFraction: 0.075,
    diskFraction: 0.24,
    thickDiskFraction: 0.11,
    starFormationRate: 0.16,
    armScatter: 0.27,
    irregularity: 0.9,
    flocculence: 0.92,
    asymmetry: 0.2,
    compact,
    includeHalo: false,
    includeGlow: !compact
  }, glowTexture);
  triangulum.position.set(-220, 32, 170);
  triangulum.rotation.set(-0.12, 0.62, -0.38);

  const largeMagellanic = createDwarfGalaxy({
    name: 'Large Magellanic Cloud',
    morphology: 'magellanic',
    count: compact ? 1250 : 5600,
    radius: 13.5,
    seed: 61573,
    color: 0x9cb8e5,
    youngColor: 0x72b8ff,
    warmColor: 0xf4a0c5,
    pointSize: compact ? 0.96 : 0.8,
    diffuseGlow: true
  }, compact, glowTexture);
  largeMagellanic.position.set(-82, -30, 94);
  largeMagellanic.rotation.z = 0.4;
  largeMagellanic.scale.setScalar(compact ? 1.12 : 1.38);

  const smallMagellanic = createDwarfGalaxy({
    name: 'Small Magellanic Cloud',
    morphology: 'irregular',
    count: compact ? 680 : 3000,
    radius: 8,
    seed: 84519,
    color: 0xaebfe2,
    youngColor: 0x7bbcff,
    warmColor: 0xec9fc3,
    pointSize: compact ? 0.92 : 0.76,
    diffuseGlow: true
  }, compact, glowTexture);
  smallMagellanic.position.set(-108, -40, 115);
  smallMagellanic.scale.setScalar(compact ? 1.12 : 1.42);

  const companionSpecs = [
    { name: 'M32', morphology: 'compact-elliptical', radius: 4.2, seed: 91352, color: 0xffd1a0, position: [306, 55, -158] },
    { name: 'M110', morphology: 'dwarf-spheroidal', radius: 7.2, seed: 59173, color: 0xbfc9dc, position: [360, 70, -196] },
    { name: 'Sagittarius Dwarf', morphology: 'dwarf-spheroidal', radius: 5.4, seed: 71344, color: 0xc6aec9, position: [-35, -15, 28] },
    { name: 'Fornax Dwarf', morphology: 'dwarf-spheroidal', radius: 6.4, seed: 22491, color: 0xaebdd5, position: [-128, -44, 104] },
    { name: 'Sculptor Dwarf', morphology: 'ultra-diffuse', radius: 7.8, seed: 86517, color: 0xa8b4c7, position: [-88, -68, 142] },
    { name: 'NGC 6822', morphology: 'irregular', radius: 7.5, seed: 31887, color: 0x91b6d9, youngColor: 0x68baff, position: [196, -38, 174] },
    { name: 'IC 10', morphology: 'irregular', radius: 5.8, seed: 44821, color: 0xb090bd, youngColor: 0x70b9ff, position: [268, 16, -90] },
    { name: 'WLM', morphology: 'irregular', radius: 5.5, seed: 62915, color: 0x9cb9d4, position: [-354, -58, -132] },
    { name: 'NGC 147', morphology: 'dwarf-spheroidal', radius: 6.6, seed: 71053, color: 0xc2bebc, position: [394, 98, -220] },
    { name: 'NGC 185', morphology: 'compact-elliptical', radius: 5.4, seed: 30817, color: 0xd6c5ad, position: [375, 24, -236] },
    { name: 'Leo I', morphology: 'dwarf-spheroidal', radius: 5.1, seed: 92847, color: 0xc5baca, position: [-178, 64, 76] },
    { name: 'Leo II', morphology: 'ultra-diffuse', radius: 6.7, seed: 10583, color: 0xaab4c2, position: [-210, 92, 48] },
    { name: 'Carina Dwarf', morphology: 'ultra-diffuse', radius: 7.2, seed: 53721, color: 0xabb3c2, position: [-105, -102, 58] },
    { name: 'Draco Dwarf', morphology: 'ultra-diffuse', radius: 7.5, seed: 26194, color: 0xa7afbd, position: [52, 118, 36] },
    { name: 'Pegasus Dwarf', morphology: 'irregular', radius: 5.8, seed: 80453, color: 0x91afcc, position: [322, -92, 132] },
    { name: 'Phoenix Dwarf', morphology: 'irregular', radius: 5.2, seed: 48639, color: 0xb4aec2, position: [-276, -110, 62] },
    { name: 'Cetus Dwarf', morphology: 'dwarf-spheroidal', radius: 6.9, seed: 64731, color: 0xb7bdca, position: [-314, 34, -214] },
    { name: 'Antlia Dwarf', morphology: 'ultra-diffuse', radius: 7.4, seed: 35719, color: 0xaab2bf, position: [116, -126, 268] }
  ];
  const activeCompanionSpecs = compact ? companionSpecs.slice(0, 9) : companionSpecs;
  const dwarfCompanions = activeCompanionSpecs.map((spec, index) => {
    const dwarf = createDwarfGalaxy({
      ...spec,
      count: compact ? 105 + index * 9 : 390 + (index % 6) * 74,
      pointSize: compact ? 0.9 : 0.74,
      diffuseGlow: !compact
    }, compact, glowTexture);
    dwarf.position.set(...spec.position);
    dwarf.rotation.set((index % 3) * 0.13, index * 0.29, (index % 2 ? -1 : 1) * 0.18);
    dwarf.scale.setScalar(compact ? 1.1 : 1.9);
    return dwarf;
  });

  const labels = [
    createGalaxyLabel('MILKY WAY · HOME', 112),
    createGalaxyLabel('ANDROMEDA · M31', 132),
    createGalaxyLabel('TRIANGULUM · M33', 134)
  ];
  labels[0].position.set(0, -34, 0);
  labels[1].position.set(330, 112, -175);
  labels[2].position.set(-220, 66, 170);
  labels[0].scale.multiplyScalar(0.72);
  labels[2].scale.multiplyScalar(0.78);
  if (compact) labels.forEach((label) => label.scale.multiplyScalar(0.72));
  const labelGroup = new THREE.Group();
  labelGroup.name = 'Principal galaxy labels';
  labelGroup.add(...labels);

  const solarMarker = tagMaterial(new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: 0xffd17f,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false
  })), 0.88);
  solarMarker.name = 'Solar position · Orion Spur';
  solarMarker.scale.set(4.8, 4.8, 1);
  solarMarker.position.set(38, 0.5, 49);
  milkyWay.add(solarMarker);

  const distantGalaxyField = createDistantGalaxyField(compact, 991827);
  root.add(
    distantGalaxyField,
    milkyWay,
    andromeda,
    triangulum,
    largeMagellanic,
    smallMagellanic,
    ...dwarfCompanions,
    labelGroup
  );
  root.visible = false;
  root.userData.performanceBudget = {
    compact,
    principalGalaxyStars: compact ? 30100 : 120500,
    distantGalaxies: distantGalaxyField.userData.galaxyCount,
    companionGalaxies: dwarfCompanions.length + 2
  };

  function update(delta, galaxyOpacity, localOpacity, motionEnabled = true) {
    root.visible = Math.max(galaxyOpacity, localOpacity) > 0.001;
    setOpacity(milkyWay, galaxyOpacity * (1 - localOpacity * 0.22));
    setOpacity(andromeda, localOpacity * 0.88);
    setOpacity(triangulum, localOpacity * 0.84);
    setOpacity(largeMagellanic, Math.max(galaxyOpacity * 0.16, localOpacity * 0.78));
    setOpacity(smallMagellanic, Math.max(galaxyOpacity * 0.12, localOpacity * 0.72));
    dwarfCompanions.forEach((dwarf, index) => {
      const morphologyFactor = dwarf.userData.morphology === 'ultra-diffuse' ? 0.78 : 1;
      setOpacity(dwarf, localOpacity * morphologyFactor * (0.68 + (index % 4) * 0.065));
    });
    setOpacity(distantGalaxyField, localOpacity * 0.9);
    labels[0].material.opacity = 0.58 * Math.max(galaxyOpacity * 0.18, localOpacity);
    labels[1].material.opacity = 0.78 * localOpacity;
    labels[2].material.opacity = 0.78 * localOpacity;

    if (motionEnabled) {
      milkyWay.rotation.y += delta * 0.0019;
      andromeda.rotation.y -= delta * 0.00105;
      triangulum.rotation.y += delta * 0.00135;
      distantGalaxyField.rotation.y += delta * 0.000055;
      distantGalaxyField.rotation.x += delta * 0.000018;
    }
    const pulse = motionEnabled ? 0.78 + Math.sin(performance.now() * 0.0018) * 0.16 : 0.82;
    solarMarker.material.opacity = 0.88 * galaxyOpacity * pulse;
  }

  function dispose() {
    disposeObject(root);
    root.removeFromParent();
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
    distantGalaxyField,
    update,
    dispose
  };
}
