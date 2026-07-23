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

function createArmProfile(config) {
  const random = seededRandom((config.seed ^ 0x9e3779b9) >>> 0);
  const sourceWeights = config.armWeights ?? Array.from({ length: config.arms }, () => 1);
  const strongest = Math.max(...sourceWeights, 0.0001);
  const phaseJitter = config.armPhaseJitter ?? (config.arms > 2 ? 0.16 : 0.08);
  const weights = [0, 0, 0, 0];
  const phases = [0, 0, 0, 0];
  const pitchScales = [1, 1, 1, 1];
  const segmentSeeds = [0, 0, 0, 0];

  for (let index = 0; index < 4; index += 1) {
    if (index >= config.arms) continue;
    weights[index] = sourceWeights[index] / strongest;
    phases[index] = (index / config.arms) * TAU + gaussian(random) * phaseJitter;
    pitchScales[index] = 0.88 + random() * 0.24;
    segmentSeeds[index] = random() * 17 + index * 3.17;
  }

  return {
    sourceWeights,
    weights,
    phases,
    pitchScales,
    segmentSeeds,
    warpPhase: random() * TAU
  };
}

function sampleExponentialDisk(random, scale = 0.235) {
  // The radius of an exponential disk follows r * exp(-r / scale). The
  // product-of-uniforms form samples that distribution without a lookup table.
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const radius = -Math.log(Math.max(0.000001, random() * random())) * scale;
    if (radius <= 1) return 0.045 + radius * 0.955;
  }
  return 0.76 + random() * 0.24;
}

function armSegmentStrength(radialRatio, armIndex, armProfile, irregularity, angle = 0) {
  const seed = armProfile.segmentSeeds[armIndex];
  const broad = 0.5 + 0.5 * Math.sin(radialRatio * (11.5 + armIndex * 1.35) + seed);
  const broken = 0.5 + 0.5 * Math.sin(radialRatio * 27.0 - seed * 1.71);
  const azimuthalWindow = 0.5 + 0.5 * Math.sin(
    angle * (1.35 + armIndex * 0.19) + radialRatio * 4.7 + seed * 0.73
  );
  const knotWindow = 0.5 + 0.5 * Math.sin(angle * 3.1 - radialRatio * 8.6 + seed * 1.43);
  return clamp(
    0.2 + broad * 0.29 + broken * 0.15 * irregularity + azimuthalWindow * 0.24 + knotWindow * 0.12,
    0.12,
    1
  );
}

function armAngleAt(radialRatio, armIndex, config, armProfile) {
  return armProfile.phases[armIndex]
    + radialRatio * config.twist * armProfile.pitchScales[armIndex]
    + Math.sin(radialRatio * (8.2 + armIndex * 0.74) + armProfile.segmentSeeds[armIndex])
      * config.irregularity * 0.075;
}

function createStarFormationComplexes(config, random, armProfile) {
  const count = config.compact
    ? Math.max(8, config.arms * 3)
    : Math.max(20, Math.round(config.radius * 0.24));
  const complexes = [];

  for (let index = 0; index < count; index += 1) {
    const armIndex = chooseWeighted(random, armProfile.sourceWeights);
    let radialRatio = config.starFormationRing
      ? clamp(config.starFormationRing + gaussian(random) * 0.085, 0.2, 0.92)
      : 0.2 + Math.pow(random(), 0.82) * 0.7;
    // Prefer surviving arm fragments, leaving genuine gaps between complexes.
    for (let retry = 0; retry < 3; retry += 1) {
      const candidateAngle = armAngleAt(radialRatio, armIndex, config, armProfile);
      if (armSegmentStrength(radialRatio, armIndex, armProfile, config.irregularity, candidateAngle) > 0.55) break;
      radialRatio = 0.2 + Math.pow(random(), 0.82) * 0.7;
    }
    complexes.push({
      armIndex,
      radialRatio,
      angle: armAngleAt(radialRatio, armIndex, config, armProfile),
      spread: 0.008 + random() * 0.015
    });
  }
  return complexes;
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
        float feather = 1.0 - smoothstep(0.04, 0.5, distanceToCenter);
        float core = pow(max(0.0, 1.0 - distanceToCenter * 2.0), 5.5);
        float halo = exp(-distanceToCenter * 8.5);
        vec3 radiance = vColor * (0.7 + halo * 0.42) + vec3(core * 0.075);
        gl_FragColor = vec4(radiance, (feather * 0.54 + core * 0.34) * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    vertexColors: true
  });
  material.toneMapped = true;
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
  compact,
  armProfile,
  warpStrength = 0.018,
  diskOpacity = 0.62
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
      seedOffset: { value: (seed % 991) / 991 },
      radius: { value: radius },
      warpStrength: { value: warpStrength },
      warpPhase: { value: armProfile.warpPhase },
      armWeights: { value: new THREE.Vector4(...armProfile.weights) },
      armPhases: { value: new THREE.Vector4(...armProfile.phases) },
      armPitch: { value: new THREE.Vector4(...armProfile.pitchScales) },
      armSegments: { value: new THREE.Vector4(...armProfile.segmentSeeds) }
    },
    vertexShader: `
      uniform float radius;
      uniform float warpStrength;
      uniform float warpPhase;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 transformed = position;
        vec2 diskPoint = (uv - 0.5) * 2.0;
        float radial = length(diskPoint);
        float angle = atan(diskPoint.y, diskPoint.x);
        float outerDisk = smoothstep(0.53, 1.0, radial);
        float warp = sin(angle - warpPhase)
          * outerDisk * outerDisk
          * radius * warpStrength;
        transformed.z += warp;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
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
      uniform vec4 armWeights;
      uniform vec4 armPhases;
      uniform vec4 armPitch;
      uniform vec4 armSegments;
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

      float angularDistance(float angle) {
        return abs(atan(sin(angle), cos(angle)));
      }

      float armRidge(
        float angle,
        float radial,
        float phaseOffset,
        float pitchScale,
        float weight,
        float segmentSeed
      ) {
        if (weight <= 0.001) return 0.0;
        float meander = sin(radial * (8.2 + segmentSeed * 0.035) + segmentSeed)
          * irregularity * 0.075;
        float ridgeAngle = phaseOffset + radial * twist * pitchScale + meander;
        float width = 0.085 + radial * 0.115 + irregularity * 0.018;
        float ridge = exp(-pow(angularDistance(angle - ridgeAngle) / width, 2.0));
        vec2 polarPoint = vec2(cos(angle), sin(angle)) * radial;
        float broadFragment = noise21(polarPoint * 5.3 + vec2(segmentSeed, segmentSeed * 0.31));
        float fineFragment = noise21(vec2(
          radial * 17.0 - segmentSeed + angle * 1.9,
          angle * 2.4 - radial * 5.1 + segmentSeed * 0.27
        ));
        float rhythm = 0.5 + 0.5 * sin(radial * (11.5 + segmentSeed * 0.08) + segmentSeed);
        float sector = 0.5 + 0.5 * sin(
          angle * (1.25 + fract(segmentSeed) * 0.7) + radial * 4.6 + segmentSeed * 0.83
        );
        float survival = smoothstep(
          0.22,
          0.77,
          broadFragment * 0.36 + fineFragment * 0.24 + rhythm * 0.16 + sector * 0.24
        );
        return ridge * weight * mix(0.07, 1.0, survival);
      }

      void main() {
        vec2 point = (vUv - 0.5) * 2.0;
        float radial = length(point);
        float angle = atan(point.y, point.x);
        float edgeRadius = 0.94
          + sin(angle * 3.0 + seedOffset * 6.28318) * 0.035
          + sin(angle * 5.0 - seedOffset * 4.1) * 0.018;
        if (radial > edgeRadius) discard;
        float edgeRadial = radial / edgeRadius;
        float coarseNoise = noise21(point * 4.7 + vec2(seedOffset * 9.0));
        float fineNoise = noise21(point * 18.0 - vec2(seedOffset * 11.0));

        float arm0 = armRidge(angle, radial, armPhases.x, armPitch.x, armWeights.x, armSegments.x);
        float arm1 = armRidge(angle, radial, armPhases.y, armPitch.y, armWeights.y, armSegments.y);
        float arm2 = armRidge(angle, radial, armPhases.z, armPitch.z, armWeights.z, armSegments.z);
        float arm3 = armRidge(angle, radial, armPhases.w, armPitch.w, armWeights.w, armSegments.w);
        float mainArm = arm0 + arm1 + arm2 + arm3;

        float branchEnvelope = smoothstep(0.36, 0.58, radial) * (1.0 - smoothstep(0.82, 1.0, radial));
        float branchOffset = 0.18 + radial * 0.11 + irregularity * 0.045;
        float branch = armRidge(angle, radial, armPhases.x + branchOffset, armPitch.x * 0.94, armWeights.x, armSegments.x + 4.7)
          + armRidge(angle, radial, armPhases.y - branchOffset * 0.8, armPitch.y * 1.07, armWeights.y, armSegments.y + 6.1)
          + armRidge(angle, radial, armPhases.z + branchOffset * 0.7, armPitch.z * 0.91, armWeights.z, armSegments.z + 8.3)
          + armRidge(angle, radial, armPhases.w - branchOffset, armPitch.w * 1.08, armWeights.w, armSegments.w + 10.9);
        float armEnvelope = smoothstep(0.11, 0.25, radial) * (1.0 - smoothstep(0.82, 1.0, radial));
        float patchiness = mix(0.58, 1.0, coarseNoise) * mix(0.76, 1.0, fineNoise);
        float angularBreak = mix(
          0.12,
          1.0,
          smoothstep(0.24, 0.76, noise21(point * 3.2 + vec2(seedOffset * 17.0, 6.4)))
        );
        float lopsided = 0.8
          + sin(angle - seedOffset * 6.28318) * 0.13
          + sin(angle * 2.0 + 1.7) * 0.055;

        float disk = exp(-radial / 0.34) * 0.23 * lopsided;
        float bulge = exp(-pow(radial / 0.145, 0.72)) * 0.74;
        float barAngle = 0.43;
        mat2 barRotation = mat2(cos(barAngle), -sin(barAngle), sin(barAngle), cos(barAngle));
        vec2 barPoint = barRotation * point;
        float bar = exp(-pow(abs(barPoint.x) / 0.36, 1.7) - pow(abs(barPoint.y) / 0.068, 1.28));
        bar *= barStrength * (1.0 - smoothstep(0.18, 0.54, radial));

        float dustOffset = 0.075 + radial * 0.065;
        float dustLane = armRidge(angle, radial, armPhases.x + dustOffset, armPitch.x, armWeights.x, armSegments.x + 1.9)
          + armRidge(angle, radial, armPhases.y + dustOffset, armPitch.y, armWeights.y, armSegments.y + 1.9)
          + armRidge(angle, radial, armPhases.z + dustOffset, armPitch.z, armWeights.z, armSegments.z + 1.9)
          + armRidge(angle, radial, armPhases.w + dustOffset, armPitch.w, armWeights.w, armSegments.w + 1.9);
        float dustFragments = smoothstep(0.46, 0.78, noise21(point * 25.0 + vec2(7.0, 13.0)));
        dustLane = clamp(dustLane * armEnvelope * mix(0.48, 1.0, dustFragments), 0.0, 1.0);
        float transmission = 1.0 - dustLane * 0.68;

        float armsLight = (mainArm * 0.29 + branch * branchEnvelope * 0.085)
          * armEnvelope * patchiness * angularBreak;
        float stellarComplexes = pow(smoothstep(0.61, 0.9, fineNoise), 2.0) * mainArm * armEnvelope;
        float feather = 1.0 - smoothstep(0.76, 1.0, edgeRadial);
        float alpha = (disk + bulge + bar * 0.5 + armsLight + stellarComplexes * 0.075)
          * transmission * feather * opacity;
        vec3 color = mix(coreColor, armColor, smoothstep(0.1, 0.64, radial));
        color = mix(color, accentColor, stellarComplexes * 0.14);
        color *= mix(0.76, 1.04, fineNoise);
        color *= 1.0 - dustLane * 0.28;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  material.toneMapped = true;
  const segments = compact ? 34 : 64;
  const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2, segments, segments);
  const disk = new THREE.Mesh(geometry, material);
  disk.rotation.x = -Math.PI / 2;
  disk.renderOrder = -4;
  return tagMaterial(disk, diskOpacity);
}

function createDustVeil({
  radius,
  twist,
  irregularity,
  compact,
  armProfile,
  warpStrength = 0.018,
  dustOpacity = 0.62
}) {
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    uniforms: {
      opacity: { value: 0 },
      twist: { value: twist },
      irregularity: { value: irregularity },
      radius: { value: radius },
      warpStrength: { value: warpStrength },
      warpPhase: { value: armProfile.warpPhase },
      armWeights: { value: new THREE.Vector4(...armProfile.weights) },
      armPhases: { value: new THREE.Vector4(...armProfile.phases) },
      armPitch: { value: new THREE.Vector4(...armProfile.pitchScales) },
      armSegments: { value: new THREE.Vector4(...armProfile.segmentSeeds) }
    },
    vertexShader: `
      uniform float radius;
      uniform float warpStrength;
      uniform float warpPhase;
      varying vec2 vUv;
      void main() {
        vUv = uv;
        vec3 transformed = position;
        vec2 diskPoint = (uv - 0.5) * 2.0;
        float radial = length(diskPoint);
        float angle = atan(diskPoint.y, diskPoint.x);
        float outerDisk = smoothstep(0.53, 1.0, radial);
        transformed.z += sin(angle - warpPhase)
          * outerDisk * outerDisk
          * radius * warpStrength
          + radius * 0.0008;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(transformed, 1.0);
      }
    `,
    fragmentShader: `
      uniform float opacity;
      uniform float twist;
      uniform float irregularity;
      uniform vec4 armWeights;
      uniform vec4 armPhases;
      uniform vec4 armPitch;
      uniform vec4 armSegments;
      varying vec2 vUv;

      float hash21(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += dot(point, point + 45.32);
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

      float lane(
        float angle,
        float radial,
        float phaseOffset,
        float pitchScale,
        float weight,
        float seed
      ) {
        if (weight <= 0.001) return 0.0;
        float meander = sin(radial * (8.2 + seed * 0.035) + seed) * irregularity * 0.075;
        float laneAngle = phaseOffset + radial * twist * pitchScale + meander + 0.07 + radial * 0.065;
        float delta = abs(atan(sin(angle - laneAngle), cos(angle - laneAngle)));
        float width = 0.027 + radial * 0.035 + irregularity * 0.008;
        float ridge = exp(-pow(delta / width, 1.7));
        float fragments = noise21(vec2(radial * 14.0 + seed, angle * 1.3 + seed));
        float rhythm = 0.5 + 0.5 * sin(radial * (13.0 + seed * 0.07) + seed);
        return ridge * weight * smoothstep(0.27, 0.75, fragments * 0.62 + rhythm * 0.38);
      }

      void main() {
        vec2 point = (vUv - 0.5) * 2.0;
        float radial = length(point);
        float angle = atan(point.y, point.x);
        float edgeRadius = 0.94
          + sin(angle * 3.0 + armSegments.x) * 0.035
          + sin(angle * 5.0 - armSegments.y) * 0.018;
        if (radial > edgeRadius) discard;
        float edgeRadial = radial / edgeRadius;
        float laneDensity = lane(angle, radial, armPhases.x, armPitch.x, armWeights.x, armSegments.x)
          + lane(angle, radial, armPhases.y, armPitch.y, armWeights.y, armSegments.y)
          + lane(angle, radial, armPhases.z, armPitch.z, armWeights.z, armSegments.z)
          + lane(angle, radial, armPhases.w, armPitch.w, armWeights.w, armSegments.w);
        float envelope = smoothstep(0.13, 0.25, radial) * (1.0 - smoothstep(0.76, 0.98, edgeRadial));
        float grain = mix(0.48, 1.0, noise21(point * 22.0 + vec2(9.0, 17.0)));
        float centralDust = exp(-radial * 7.8)
          * smoothstep(0.46, 0.78, noise21(point * 31.0 + vec2(4.0, 12.0)));
        float alpha = clamp(laneDensity * envelope * grain * 0.34 + centralDust * 0.11, 0.0, 0.34) * opacity;
        if (alpha < 0.002) discard;
        vec3 dustColor = mix(vec3(0.004, 0.005, 0.008), vec3(0.018, 0.011, 0.008), smoothstep(0.05, 0.5, radial));
        gl_FragColor = vec4(dustColor, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  material.toneMapped = true;
  const segments = compact ? 28 : 48;
  const geometry = new THREE.PlaneGeometry(radius * 2, radius * 2, segments, segments);
  const dust = new THREE.Mesh(geometry, material);
  dust.name = 'Fragmented dust lanes';
  dust.rotation.x = -Math.PI / 2;
  dust.renderOrder = 3;
  return tagMaterial(dust, dustOpacity);
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
    baseOpacity: 0.18,
    pointScale: config.compact ? 1.22 : 0.94,
    maximumSize: config.compact ? 5.4 : 6.6,
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
  const armProfile = createArmProfile(config);
  const starFormationComplexes = createStarFormationComplexes(config, random, armProfile);
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
    let localArmContrast = 1;
    let dustTransmission = 1;
    let outerTransmission = 1;

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
      radialRatio = sampleExponentialDisk(random, config.radialScale ?? 0.235);
      const starFormationCandidate = random() < config.starFormationRate;
      const isDiskStar = random() < config.diskFraction;
      let angle;
      let armIndex = -1;
      if (isDiskStar) {
        angle = random() * TAU;
      } else {
        let complex = null;
        if (starFormationCandidate && starFormationComplexes.length && random() < 0.76) {
          complex = starFormationComplexes[Math.floor(random() * starFormationComplexes.length)];
          armIndex = complex.armIndex;
          radialRatio = clamp(complex.radialRatio + gaussian(random) * complex.spread, 0.12, 0.97);
        } else {
          armIndex = chooseWeighted(random, armProfile.sourceWeights);
          if (starFormationCandidate && config.starFormationRing) {
            radialRatio = clamp(config.starFormationRing + gaussian(random) * 0.085, 0.18, 0.94);
          }
        }
        const armWidth = config.armScatter * (0.52 + radialRatio * 0.9);
        const ridgeAngle = armAngleAt(radialRatio, armIndex, config, armProfile);
        const segmentStrength = armSegmentStrength(
          radialRatio,
          armIndex,
          armProfile,
          config.irregularity,
          ridgeAngle
        );
        const branchOffset = random() < config.flocculence * (0.14 + segmentStrength * 0.3)
          ? (random() > 0.5 ? 1 : -1) * (0.16 + radialRatio * 0.14 + random() * 0.16)
          : 0;
        const fallsInGap = random() > segmentStrength;
        const scatterMultiplier = fallsInGap ? 3.1 : 1;
        const scatter = gaussian(random) * armWidth * scatterMultiplier
          + (fallsInGap ? (random() - 0.5) * 0.58 : 0);
        angle = ridgeAngle
          + branchOffset
          + scatter;
        localArmContrast = (fallsInGap ? 0.16 : 0.5) + segmentStrength * (fallsInGap ? 0.22 : 0.5);
        const dustCenter = armWidth * (0.46 + radialRatio * 0.3);
        const dustWidth = Math.max(0.018, armWidth * 0.22);
        const dustDistance = Math.abs(scatter - dustCenter);
        const dustLane = Math.exp(-(dustDistance * dustDistance) / (2 * dustWidth * dustWidth));
        dustTransmission = 1 - dustLane * (0.38 + segmentStrength * 0.2);
        isStarForming = starFormationCandidate && segmentStrength > 0.48;
      }
      const asymmetry = 1 + config.asymmetry
        * (Math.sin(angle - 0.8) * 0.72 + Math.sin(angle * 2 + 1.3) * 0.28)
        * (0.3 + radialRatio * 0.7);
      const edgeDistortion = 1 + (config.edgeIrregularity ?? 0.035)
        * Math.pow(radialRatio, 1.6)
        * (Math.sin(angle * 3 + armProfile.warpPhase) * 0.68
          + Math.sin(angle * 5 - armProfile.warpPhase * 0.7) * 0.32);
      const localEdge = 0.86
        + (0.5 + 0.5 * Math.sin(angle * 3 + armProfile.warpPhase)) * 0.075
        + (0.5 + 0.5 * Math.sin(angle * 5 - armProfile.warpPhase * 0.7)) * 0.035;
      outerTransmission = clamp((localEdge + 0.11 - radialRatio) / 0.11, 0.08, 1);
      const radialDistance = radialRatio
        * config.radius
        * (1 + gaussian(random) * 0.021)
        * asymmetry
        * edgeDistortion;
      x = Math.cos(angle) * radialDistance;
      z = Math.sin(angle) * radialDistance;
      const isThickDisk = random() < config.thickDiskFraction;
      const verticalScale = isThickDisk
        ? 0.7 + radialRatio * 0.38
        : 0.16 + radialRatio * 0.18;
      const outerWarp = Math.pow(clamp((radialRatio - 0.54) / 0.46, 0, 1), 1.72);
      const warp = Math.sin(angle - armProfile.warpPhase)
        * outerWarp
        * config.radius
        * (config.warpStrength ?? 0.018);
      y = gaussian(random) * config.thickness * verticalScale + warp;
      if (isThickDisk) thickDiskCount += 1;
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
      color.lerp(random() < 0.34 ? accent : arm, 0.46 + random() * 0.22);
      sizes[index] = config.pointSize * (1.25 + random() * 1.7);
      starFormingCount += 1;
    } else {
      sizes[index] = config.pointSize * (0.42 + random() * 0.92);
    }
    const brightness = isBulge
      ? 0.58 + random() * 0.36
      : (0.34 + random() * 0.5) * localArmContrast * dustTransmission * outerTransmission;
    colors[index * 3] = color.r * brightness;
    colors[index * 3 + 1] = color.g * brightness;
    colors[index * 3 + 2] = color.b * brightness;
  }

  const disk = createLuminousDisk({ ...config, compact: config.compact, armProfile });
  const stars = createPointCloud({
    positions,
    colors,
    sizes,
    baseOpacity: config.starOpacity ?? 0.82,
    pointScale: (config.compact ? 1.3 : 1.05) * (config.pointScaleBoost ?? 1),
    maximumSize: (config.compact ? 6.2 : 7.1) * Math.min(config.pointScaleBoost ?? 1, 1.12),
    name: `${config.name} · thin disk, thick disk and star-forming regions`
  });
  stars.renderOrder = -2;
  const dust = config.includeDust === false
    ? null
    : createDustVeil({ ...config, compact: config.compact, armProfile });
  const halo = config.includeHalo === false ? null : createHaloPopulation(config, random);

  const glowMaterial = new THREE.SpriteMaterial({
    map: glowTexture,
    color: config.coreColor,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: true
  });
  const glow = config.includeGlow === false ? null : tagMaterial(new THREE.Sprite(glowMaterial), config.glowOpacity ?? 0.19);
  if (glow) glow.scale.set(config.radius * 0.48, config.radius * 0.28, 1);

  const group = new THREE.Group();
  group.name = config.name;
  group.add(disk, stars);
  if (dust) group.add(dust);
  if (halo) group.add(halo);
  if (glow) group.add(glow);
  group.userData.disk = disk;
  group.userData.stars = stars;
  group.userData.dust = dust;
  group.userData.glow = glow;
  group.userData.halo = halo;
  group.userData.starFormingRegions = stars;
  group.userData.structure = {
    arms: config.arms,
    barStars: barCount,
    thickDiskStars: thickDiskCount,
    starFormingRegions: starFormingCount,
    starFormingComplexes: starFormationComplexes.length,
    warpedOuterDisk: true,
    dustLanePass: Boolean(dust),
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
    const surfaceBrightness = morphology === 'ultra-diffuse' ? 0.52 : 0.74;
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
    baseOpacity: morphology === 'ultra-diffuse' ? 0.43 : 0.75,
    pointScale: compact ? 1.6 : 1.27,
    maximumSize: compact ? 6.5 : 8,
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
    })), morphology === 'ultra-diffuse' ? 0.19 : 0.35);
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
  const seeds = new Float32Array(count);
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
    color.multiplyScalar(0.53 + random() * 0.4);
    colors[index * 3] = color.r;
    colors[index * 3 + 1] = color.g;
    colors[index * 3 + 2] = color.b;
    sizes[index] = compact ? 8.8 + random() * 18.2 : 9.8 + random() * 23.8;
    angles[index] = random() * TAU;
    aspects[index] = kind < 0.34 ? 1.1 + random() * 1.2 : 1.5 + random() * 2.6;
    alphas[index] = 0.3 + random() * 0.55;
    seeds[index] = random();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aAngle', new THREE.BufferAttribute(angles, 1));
  geometry.setAttribute('aAspect', new THREE.BufferAttribute(aspects, 1));
  geometry.setAttribute('aMorphology', new THREE.BufferAttribute(morphologies, 1));
  geometry.setAttribute('aAlpha', new THREE.BufferAttribute(alphas, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  geometry.computeBoundingSphere();

  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexColors: true,
    uniforms: {
      opacity: { value: 0 },
      compactBoost: { value: compact ? 1.25 : 1.08 }
    },
    vertexShader: `
      attribute float aSize;
      attribute float aAngle;
      attribute float aAspect;
      attribute float aMorphology;
      attribute float aAlpha;
      attribute float aSeed;
      uniform float compactBoost;
      varying vec3 vColor;
      varying float vAngle;
      varying float vAspect;
      varying float vMorphology;
      varying float vAlpha;
      varying float vSeed;
      void main() {
        vColor = color;
        vAngle = aAngle;
        vAspect = aAspect;
        vMorphology = aMorphology;
        vAlpha = aAlpha;
        vSeed = aSeed;
        vec4 viewPosition = modelViewMatrix * vec4(position, 1.0);
        gl_PointSize = clamp(aSize * compactBoost * (980.0 / max(500.0, -viewPosition.z)), 2.3, 18.5);
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
      varying float vSeed;
      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float cosine = cos(vAngle);
        float sine = sin(vAngle);
        point = mat2(cosine, -sine, sine, cosine) * point;
        point.y *= vAspect;
        float angle = atan(point.y, point.x);
        float lopsided = 1.0 + sin(angle + vSeed * 17.0) * 0.075;
        float radial = length(point) * 2.0 * lopsided;
        if (radial > 1.0) discard;
        float elliptical = exp(-pow(radial, 0.68) * 5.1);
        float disk = exp(-radial * 3.7);
        float armHint = 0.76 + 0.24 * cos(angle * (2.0 + step(0.58, vSeed)) - radial * (6.4 + vSeed * 2.3) + vSeed * 12.0);
        float dustLane = exp(-pow(abs(point.y) * (11.0 + vSeed * 7.0), 1.35));
        float spiral = disk * armHint * (1.0 - dustLane * smoothstep(2.1, 3.7, vAspect) * 0.55);
        vec2 clumpA = point - vec2(sin(vSeed * 11.0), cos(vSeed * 7.0)) * 0.09;
        vec2 clumpB = point + vec2(cos(vSeed * 13.0), sin(vSeed * 9.0)) * 0.14;
        float irregular = exp(-length(clumpA) * 6.0) * 0.62 + exp(-length(clumpB) * 8.5) * 0.48;
        float ellipticalMix = 1.0 - smoothstep(0.29, 0.38, vMorphology);
        float irregularMix = smoothstep(0.79, 0.92, vMorphology);
        float profile = mix(spiral, elliptical, ellipticalMix);
        profile = mix(profile, irregular, irregularMix);
        float grain = 0.86 + 0.14 * sin((point.x * 83.0 + point.y * 59.0 + vSeed * 31.0));
        profile *= grain;
        float core = exp(-radial * (10.0 + vSeed * 5.0));
        float edge = 1.0 - smoothstep(0.72, 1.0, radial);
        vec3 radiance = vColor * (0.82 + profile * 0.2) + core * vec3(0.055, 0.043, 0.032);
        gl_FragColor = vec4(radiance, (profile + core * 0.24) * edge * vAlpha * opacity);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  material.toneMapped = true;
  const field = new THREE.Points(geometry, material);
  field.name = 'Deep galaxy field · mixed morphology';
  field.frustumCulled = false;
  field.userData.galaxyCount = count;
  return tagMaterial(field, 0.75);
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
    radius: 130,
    thickness: 6,
    arms: 4,
    armWeights: [1, 0.42, 0.78, 0.32],
    twist: 5.05,
    seed: 412198,
    coreColor: 0xf1c28f,
    diskColor: 0xd8cbb9,
    armColor: 0x91a6c1,
    accentColor: 0xc39aaa,
    haloColor: 0x8d9db8,
    clusterColor: 0xffd091,
    pointSize: compact ? 1.02 : 0.88,
    barStrength: 0.86,
    bulgeFraction: 0.135,
    diskFraction: 0.46,
    thickDiskFraction: 0.14,
    starFormationRate: 0.084,
    armScatter: 0.108,
    irregularity: 0.72,
    flocculence: 0.52,
    asymmetry: 0.11,
    armPhaseJitter: 0.13,
    warpStrength: 0.027,
    edgeIrregularity: 0.05,
    diskOpacity: 0.7,
    starOpacity: 0.8,
    glowOpacity: 0.16,
    pointScaleBoost: 1.08,
    compact,
    includeHalo: true,
    includeGlow: true
  }, glowTexture);
  milkyWay.rotation.set(-0.12, 0.16, -0.12);

  const andromeda = createSpiralGalaxy({
    name: 'Andromeda Galaxy',
    count: compact ? 8200 : 36000,
    radius: 100,
    thickness: 4.6,
    arms: 2,
    armWeights: [1, 0.66],
    twist: 3.72,
    seed: 773901,
    coreColor: 0xf1d1ad,
    diskColor: 0xd8cec2,
    armColor: 0xa5afc0,
    accentColor: 0xb8a5b3,
    haloColor: 0x9ca7b8,
    clusterColor: 0xffd6a8,
    pointSize: compact ? 0.98 : 0.82,
    barStrength: 0.22,
    bulgeFraction: 0.215,
    diskFraction: 0.54,
    thickDiskFraction: 0.18,
    starFormationRate: 0.058,
    starFormationRing: 0.58,
    armScatter: 0.19,
    irregularity: 0.31,
    flocculence: 0.12,
    asymmetry: 0.065,
    armPhaseJitter: 0.055,
    warpStrength: 0.014,
    edgeIrregularity: 0.026,
    diskOpacity: 0.64,
    starOpacity: 0.78,
    glowOpacity: 0.16,
    pointScaleBoost: 1.1,
    compact,
    includeHalo: !compact,
    includeDust: !compact,
    includeGlow: true
  }, glowTexture);
  andromeda.position.set(330, 64, -175);
  andromeda.rotation.set(0.28, -0.46, 0.34);

  const triangulum = createSpiralGalaxy({
    name: 'Triangulum Galaxy',
    count: compact ? 3900 : 16500,
    radius: 45,
    thickness: 2.9,
    arms: 3,
    armWeights: [1, 0.56, 0.34],
    twist: 5.35,
    seed: 193381,
    coreColor: 0xe9c9a2,
    diskColor: 0xcfcbc2,
    armColor: 0x8ea9c4,
    accentColor: 0xc493a7,
    haloColor: 0x8699b4,
    clusterColor: 0xf6c994,
    pointSize: compact ? 0.91 : 0.72,
    barStrength: 0.035,
    bulgeFraction: 0.055,
    diskFraction: 0.4,
    thickDiskFraction: 0.11,
    starFormationRate: 0.128,
    armScatter: 0.27,
    irregularity: 1.04,
    flocculence: 0.92,
    asymmetry: 0.23,
    armPhaseJitter: 0.2,
    warpStrength: 0.032,
    edgeIrregularity: 0.065,
    diskOpacity: 0.61,
    starOpacity: 0.8,
    glowOpacity: 0.14,
    pointScaleBoost: 1.12,
    compact,
    includeHalo: false,
    includeDust: !compact,
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
  solarMarker.renderOrder = 10;
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
