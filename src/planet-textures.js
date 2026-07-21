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

function paintRocky(context, width, height, random, palette, craterCount, polarCaps = false) {
  const gradient = context.createLinearGradient(0, 0, width, height);
  palette.forEach((color, index) => gradient.addColorStop(index / (palette.length - 1), color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, width, height);

  noiseLayer(context, width, height, random, palette, 1200, 0.08);

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
    crater.addColorStop(0, 'rgba(255,255,255,0.12)');
    crater.addColorStop(0.55, 'rgba(30,20,16,0.25)');
    crater.addColorStop(0.76, 'rgba(255,230,200,0.09)');
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
      paintGasGiant(context, canvas.width, canvas.height, random, ['#8e5e27', '#d19a4d', '#f0c875', '#b57b37'], { swirlAlpha: 0.28 });
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
      break;
    case 'Jupiter':
      paintGasGiant(context, canvas.width, canvas.height, random, ['#8d6349', '#d6b291', '#ede0ca', '#a7795d', '#c99470'], { greatRedSpot: true, swirlAlpha: 0.25 });
      break;
    case 'Saturn':
      paintGasGiant(context, canvas.width, canvas.height, random, ['#8e7954', '#c8b37e', '#eadba8', '#a99669'], { swirlAlpha: 0.11 });
      break;
    case 'Uranus':
      paintGasGiant(context, canvas.width, canvas.height, random, ['#71aeb7', '#a3d2d4', '#7fbec6', '#c3e4e2'], { swirlAlpha: 0.055 });
      break;
    case 'Neptune':
      paintGasGiant(context, canvas.width, canvas.height, random, ['#173d86', '#285bad', '#5d8ed2', '#224b99'], { swirlAlpha: 0.19, storm: true });
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
  gradient.addColorStop(0, '#ffb13c');
  gradient.addColorStop(0.48, '#ffdc83');
  gradient.addColorStop(1, '#f78d26');
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);

  context.globalCompositeOperation = 'screen';
  for (let i = 0; i < 2800; i += 1) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const radius = 0.4 + random() * 2.6;
    context.globalAlpha = 0.06 + random() * 0.18;
    context.fillStyle = random() > 0.25 ? '#fff0b0' : '#ff6f22';
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
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
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform float opacity;
      varying vec2 vUv;
      void main() {
        float radius = length(vUv - vec2(0.5)) * 2.0;
        float bands = sin(radius * 155.0) * 0.12 + sin(radius * 43.0) * 0.08;
        float division = smoothstep(0.01, 0.035, abs(radius - 0.72));
        float edge = smoothstep(0.04, 0.12, radius) * (1.0 - smoothstep(0.90, 0.99, radius));
        float alpha = clamp((0.34 + bands) * division * edge, 0.0, 0.78) * opacity;
        vec3 color = mix(vec3(0.50, 0.43, 0.32), vec3(0.94, 0.86, 0.66), radius);
        gl_FragColor = vec4(color, alpha);
      }
    `
  });
}
