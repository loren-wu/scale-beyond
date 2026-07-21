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

function textureFromCanvas(canvas, anisotropy) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = anisotropy;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

function noiseLayer(context, width, height, random, colors, count, alpha = 0.12) {
  context.save();
  for (let i = 0; i < count; i += 1) {
    const x = random() * width;
    const y = random() * height;
    const radius = 1 + random() * width * 0.015;
    context.globalAlpha = alpha * (0.35 + random() * 0.9);
    context.fillStyle = colors[Math.floor(random() * colors.length)];
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }
  context.restore();
}

function paintFractalGrain(context, width, height, random, strength = 0.16) {
  const grain = document.createElement('canvas');
  const grainWidth = Math.max(64, Math.round(width / 4));
  const grainHeight = Math.max(32, Math.round(height / 4));
  grain.width = grainWidth;
  grain.height = grainHeight;
  const grainContext = grain.getContext('2d');
  const image = grainContext.createImageData(grainWidth, grainHeight);

  for (let index = 0; index < image.data.length; index += 4) {
    const broad = random() + random() + random();
    const value = Math.round(255 * (0.22 + broad * 0.19));
    image.data[index] = value;
    image.data[index + 1] = value;
    image.data[index + 2] = value;
    image.data[index + 3] = 255;
  }
  grainContext.putImageData(image, 0, 0);

  context.save();
  context.globalCompositeOperation = 'soft-light';
  context.globalAlpha = strength;
  context.imageSmoothingEnabled = true;
  context.drawImage(grain, 0, 0, width, height);
  context.globalAlpha = strength * 0.52;
  context.translate(width * 0.37, height * 0.19);
  context.scale(2.35, 2.35);
  context.drawImage(grain, -width * 0.37, -height * 0.19, width, height);
  context.restore();
}

function paintTerrainVeins(context, width, height, random, palette, count = 90) {
  context.save();
  context.globalCompositeOperation = 'soft-light';
  for (let index = 0; index < count; index += 1) {
    const x = random() * width;
    const y = height * (0.08 + random() * 0.84);
    const length = width * (0.025 + random() * 0.15);
    const direction = random() > 0.5 ? 1 : -1;
    context.strokeStyle = palette[Math.floor(random() * palette.length)];
    context.globalAlpha = 0.04 + random() * 0.11;
    context.lineWidth = 0.35 + random() * 2.2;
    context.beginPath();
    context.moveTo(x, y);
    context.bezierCurveTo(
      x + length * 0.28,
      y + direction * (random() - 0.25) * height * 0.035,
      x + length * 0.7,
      y - direction * (random() - 0.25) * height * 0.045,
      x + length,
      y + (random() - 0.5) * height * 0.04
    );
    context.stroke();
  }
  context.restore();
}

function paintRocky(context, width, height, random, palette, craterCount, polarCaps = false) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  palette.forEach((color, index) => gradient.addColorStop(index / (palette.length - 1), color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  paintFractalGrain(context, width, height, random, 0.24);
  noiseLayer(context, width, height, random, palette, 1500, 0.09);
  paintTerrainVeins(context, width, height, random, palette, 110);

  for (let i = 0; i < craterCount; i += 1) {
    const x = random() * width;
    const y = height * (0.08 + random() * 0.84);
    const radius = 2 + random() * width * 0.018;
    const crater = context.createRadialGradient(
      x - radius * 0.3,
      y - radius * 0.3,
      radius * 0.08,
      x,
      y,
      radius
    );
    crater.addColorStop(0, 'rgba(255,255,255,0.11)');
    crater.addColorStop(0.42, 'rgba(30,20,16,0.28)');
    crater.addColorStop(0.68, 'rgba(16,12,10,0.24)');
    crater.addColorStop(0.77, 'rgba(255,230,200,0.12)');
    crater.addColorStop(1, 'rgba(0,0,0,0)');
    context.fillStyle = crater;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  if (polarCaps) {
    const north = context.createLinearGradient(0, 0, 0, height * 0.14);
    north.addColorStop(0, 'rgba(240,232,216,0.9)');
    north.addColorStop(1, 'rgba(240,232,216,0)');
    context.fillStyle = north;
    context.fillRect(0, 0, width, height * 0.14);
    const south = context.createLinearGradient(0, height, 0, height * 0.86);
    south.addColorStop(0, 'rgba(240,232,216,0.8)');
    south.addColorStop(1, 'rgba(240,232,216,0)');
    context.fillStyle = south;
    context.fillRect(0, height * 0.86, width, height * 0.14);
  }
}

function paintGasGiant(context, width, height, random, palette, options = {}) {
  let y = 0;
  while (y < height) {
    const bandHeight = 5 + random() * 28;
    const color = palette[Math.floor(random() * palette.length)];
    const gradient = context.createLinearGradient(0, y, 0, y + bandHeight);
    gradient.addColorStop(0, color);
    gradient.addColorStop(0.52, palette[Math.floor(random() * palette.length)]);
    gradient.addColorStop(1, color);
    context.fillStyle = gradient;
    context.fillRect(0, y, width, bandHeight + 1);
    y += bandHeight;
  }

  paintFractalGrain(context, width, height, random, options.grain ?? 0.12);

  context.save();
  context.globalAlpha = options.swirlAlpha ?? 0.18;
  for (let i = 0; i < 340; i += 1) {
    const x = random() * width;
    const cy = random() * height;
    const length = width * (0.01 + random() * 0.055);
    context.strokeStyle = palette[Math.floor(random() * palette.length)];
    context.lineWidth = 0.7 + random() * 2.8;
    context.beginPath();
    context.moveTo(x, cy);
    context.bezierCurveTo(x + length * 0.3, cy - 3, x + length * 0.68, cy + 4, x + length, cy);
    context.stroke();
  }
  context.restore();

  context.save();
  context.globalCompositeOperation = 'soft-light';
  context.globalAlpha = options.fineBands ?? 0.22;
  for (let index = 0; index < 84; index += 1) {
    const cy = random() * height;
    const amplitude = 0.4 + random() * 2.8;
    const wavelength = width * (0.035 + random() * 0.12);
    context.strokeStyle = palette[Math.floor(random() * palette.length)];
    context.lineWidth = 0.25 + random() * 1.1;
    context.beginPath();
    for (let x = -8; x <= width + 8; x += 8) {
      const yOffset = Math.sin((x / wavelength) * Math.PI * 2 + random() * 0.15) * amplitude;
      if (x === -8) context.moveTo(x, cy + yOffset);
      else context.lineTo(x, cy + yOffset);
    }
    context.stroke();
  }
  context.restore();

  if (options.greatRedSpot) {
    const x = width * 0.72;
    const cy = height * 0.63;
    const spot = context.createRadialGradient(x, cy, 2, x, cy, width * 0.055);
    spot.addColorStop(0, '#d98d69');
    spot.addColorStop(0.55, '#b65f45');
    spot.addColorStop(1, 'rgba(123,55,38,0)');
    context.fillStyle = spot;
    context.beginPath();
    context.ellipse(x, cy, width * 0.065, height * 0.052, -0.08, 0, Math.PI * 2);
    context.fill();

    context.save();
    context.translate(x, cy);
    context.scale(1, 0.52);
    context.globalAlpha = 0.28;
    for (let ring = 0; ring < 7; ring += 1) {
      context.strokeStyle = ring % 2 === 0 ? '#f3c09a' : '#742f27';
      context.lineWidth = 0.8 + ring * 0.24;
      context.beginPath();
      context.ellipse(0, 0, width * (0.018 + ring * 0.006), width * (0.018 + ring * 0.006), -0.08, 0, Math.PI * 2);
      context.stroke();
    }
    context.restore();
  }

  if (options.storm) {
    context.fillStyle = 'rgba(15,33,74,0.36)';
    context.beginPath();
    context.ellipse(width * 0.31, height * 0.58, width * 0.037, height * 0.03, 0.2, 0, Math.PI * 2);
    context.fill();
  }
}

export function createPlanetTexture(name, anisotropy, compact = false) {
  const canvas = document.createElement('canvas');
  canvas.width = compact ? 512 : 1024;
  canvas.height = canvas.width / 2;
  const context = canvas.getContext('2d');
  const random = seededRandom([...name].reduce((sum, character) => sum + character.charCodeAt(0), 811));

  switch (name) {
    case 'Mercury':
      paintRocky(context, canvas.width, canvas.height, random, ['#5e5a56', '#918a82', '#b4ada4', '#69645f'], 145);
      break;
    case 'Venus':
      paintGasGiant(context, canvas.width, canvas.height, random, ['#80501f', '#c28a3d', '#f2cc79', '#a96e2e'], {
        swirlAlpha: 0.31,
        fineBands: 0.28,
        grain: 0.17
      });
      break;
    case 'Mars':
      paintRocky(context, canvas.width, canvas.height, random, ['#6f2e1e', '#a8462b', '#c96d42', '#7a3427'], 58, true);
      context.globalAlpha = 0.22;
      context.fillStyle = '#3b251f';
      for (let i = 0; i < 22; i += 1) {
        context.beginPath();
        context.ellipse(random() * canvas.width, canvas.height * (0.2 + random() * 0.6), 18 + random() * 80, 6 + random() * 20, random(), 0, Math.PI * 2);
        context.fill();
      }
      context.globalAlpha = 1;
      context.save();
      context.strokeStyle = 'rgba(55, 27, 22, 0.32)';
      context.lineWidth = canvas.width * 0.006;
      context.beginPath();
      context.moveTo(canvas.width * 0.42, canvas.height * 0.56);
      context.bezierCurveTo(
        canvas.width * 0.49,
        canvas.height * 0.49,
        canvas.width * 0.58,
        canvas.height * 0.63,
        canvas.width * 0.68,
        canvas.height * 0.55
      );
      context.stroke();
      context.restore();
      break;
    case 'Jupiter':
      paintGasGiant(context, canvas.width, canvas.height, random, ['#76503c', '#c49b79', '#eee2cc', '#95654e', '#d0a077'], {
        greatRedSpot: true,
        swirlAlpha: 0.29,
        fineBands: 0.32,
        grain: 0.14
      });
      break;
    case 'Saturn':
      paintGasGiant(context, canvas.width, canvas.height, random, ['#796744', '#b9a16e', '#ead9a4', '#96825b'], {
        swirlAlpha: 0.13,
        fineBands: 0.2,
        grain: 0.08
      });
      break;
    case 'Uranus':
      paintGasGiant(context, canvas.width, canvas.height, random, ['#579ca8', '#91c5c9', '#6eafb9', '#b8dada'], {
        swirlAlpha: 0.065,
        fineBands: 0.09,
        grain: 0.045
      });
      break;
    case 'Neptune':
      paintGasGiant(context, canvas.width, canvas.height, random, ['#102f72', '#2050a2', '#5682c8', '#183d88'], {
        swirlAlpha: 0.22,
        fineBands: 0.18,
        grain: 0.08,
        storm: true
      });
      break;
    default:
      paintRocky(context, canvas.width, canvas.height, random, ['#777', '#aaa', '#555'], 45);
  }

  return textureFromCanvas(canvas, anisotropy);
}

export function createSunTexture(anisotropy, compact = false) {
  const canvas = document.createElement('canvas');
  canvas.width = compact ? 512 : 1024;
  canvas.height = canvas.width / 2;
  const context = canvas.getContext('2d');
  const random = seededRandom(57721);
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#ee8f1f');
  gradient.addColorStop(0.42, '#ffd46c');
  gradient.addColorStop(0.72, '#ffb233');
  gradient.addColorStop(1, '#dc6416');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  paintFractalGrain(context, canvas.width, canvas.height, random, 0.28);

  context.globalCompositeOperation = 'screen';
  for (let i = 0; i < (compact ? 2600 : 5200); i += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 0.35 + random() * 2.1;
    context.globalAlpha = 0.045 + random() * 0.2;
    context.fillStyle = random() > 0.22 ? '#fff1b0' : '#ff7a22';
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
  }

  context.globalAlpha = 1;
  context.globalCompositeOperation = 'multiply';
  for (let group = 0; group < (compact ? 5 : 9); group += 1) {
    const x = random() * canvas.width;
    const y = canvas.height * (0.12 + random() * 0.76);
    const radius = canvas.width * (0.004 + random() * 0.009);
    const spot = context.createRadialGradient(x, y, radius * 0.1, x, y, radius);
    spot.addColorStop(0, 'rgba(40, 12, 7, 0.88)');
    spot.addColorStop(0.35, 'rgba(83, 28, 11, 0.64)');
    spot.addColorStop(0.72, 'rgba(162, 75, 24, 0.26)');
    spot.addColorStop(1, 'rgba(255, 180, 70, 0)');
    context.fillStyle = spot;
    context.beginPath();
    context.ellipse(x, y, radius * (1.1 + random()), radius * (0.52 + random() * 0.4), random() * Math.PI, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
  context.globalCompositeOperation = 'source-over';
  return textureFromCanvas(canvas, anisotropy);
}

export function createRingMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
    uniforms: {
      opacity: { value: 0.72 }
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
      uniform float opacity;
      varying vec2 vUv;
      varying vec3 vViewNormal;
      varying vec3 vViewPosition;

      float hash21(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += dot(point, point + 45.32);
        return fract(point.x * point.y);
      }

      void main() {
        float radius = length(vUv - vec2(0.5)) * 2.0;
        float broadBands = sin(radius * 43.0) * 0.06 + sin(radius * 137.0) * 0.085;
        float fineBands = sin(radius * 411.0) * 0.035 + sin(radius * 853.0) * 0.018;
        float cassiniDivision = smoothstep(0.008, 0.025, abs(radius - 0.738));
        float enckeGap = mix(0.3, 1.0, smoothstep(0.002, 0.009, abs(radius - 0.902)));
        float edge = smoothstep(0.655, 0.675, radius) * (1.0 - smoothstep(0.972, 0.998, radius));
        float particleGrain = 0.9 + hash21(vec2(floor(radius * 1400.0), floor(atan(vUv.y - 0.5, vUv.x - 0.5) * 180.0))) * 0.12;
        float facing = 0.35 + 0.65 * abs(dot(normalize(vViewNormal), normalize(-vViewPosition)));
        float alpha = clamp((0.34 + broadBands + fineBands) * cassiniDivision * enckeGap * edge * particleGrain, 0.0, 0.76);
        alpha *= opacity * mix(0.72, 1.0, facing);
        vec3 innerColor = vec3(0.58, 0.49, 0.36);
        vec3 outerColor = vec3(0.91, 0.84, 0.67);
        vec3 color = mix(innerColor, outerColor, smoothstep(0.67, 0.97, radius));
        color *= 0.9 + broadBands * 0.65;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
    toneMapped: true
  });
}
