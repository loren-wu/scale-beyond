import * as THREE from 'three';

const DEFAULT_TEXTURE = 'assets/cosmic/milky-way-sky-band-v1.jpg';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}
function smoothstep(edge0, edge1, value) {
  const amount = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return amount * amount * (3 - 2 * amount);
}

function visibilityForScale(scale) {
  const fadeIn = smoothstep(260, 480, scale);
  const fadeOut = 1 - smoothstep(900, 1120, scale);
  return fadeIn * fadeOut;
}

function createPlaceholderTexture() {
  const data = new Uint8Array([0, 0, 0, 255]);
  const texture = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Creates a distant, camera-surrounding Milky Way band for the solar-system view.
 *
 * Add `root` to the scene (not the camera), then call `update(delta, scale)` once
 * per frame. The scale envelope is intentionally owned here so the visual stays
 * strongest from 480-850 and yields to the external-galaxy view after 900.
 */
export function createSkyBand({
  texturePath = DEFAULT_TEXTURE,
  anisotropy = 4,
  compact = false,
  onLoad,
  onError
} = {}) {
  const root = new THREE.Group();
  root.name = 'Solar-system Milky Way sky band';
  root.position.set(0, compact ? -12 : -22, -30);
  root.rotation.set(-0.025, 0, THREE.MathUtils.degToRad(-7.5));
  root.visible = false;

  const radius = compact ? 1180 : 1320;
  const height = compact ? 1180 : 1080;
  const arc = compact ? Math.PI * 1.12 : Math.PI * 0.98;
  const geometry = new THREE.CylinderGeometry(
    radius,
    radius,
    height,
    compact ? 96 : 160,
    1,
    true,
    Math.PI - arc * 0.5,
    arc
  );

  let texture = createPlaceholderTexture();
  let loaded = false;
  let disposed = false;
  let elapsed = 0;
  let masterOpacity = 0.86;
  let motionEnabled = true;
  let viewportAspect = 1;

  const uniforms = {
    map: { value: texture },
    opacity: { value: 0 },
    time: { value: 0 },
    viewportAspect: { value: viewportAspect },
    tint: { value: new THREE.Color(0xd8e5ff) }
  };

  const material = new THREE.ShaderMaterial({
    name: 'Milky Way sky band material',
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    blending: THREE.AdditiveBlending,
    toneMapped: true,
    vertexShader: `
      varying vec2 vUv;

      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      uniform float opacity;
      uniform float time;
      uniform float viewportAspect;
      uniform vec3 tint;
      varying vec2 vUv;

      float hash21(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += dot(point, point + 45.32);
        return fract(point.x * point.y);
      }

      void main() {
        float drift = sin(time * 0.024) * 0.0018;
        vec2 sampleUv = vec2(clamp(vUv.x + drift, 0.002, 0.998), vUv.y);
        vec4 texel = texture2D(map, sampleUv);

        float horizontalFeather = smoothstep(0.015, 0.115, vUv.x)
          * (1.0 - smoothstep(0.885, 0.985, vUv.x));
        float verticalFeather = smoothstep(0.025, 0.255, vUv.y)
          * (1.0 - smoothstep(0.745, 0.975, vUv.y));
        float feather = horizontalFeather * verticalFeather;

        float luminance = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
        float structure = smoothstep(0.012, 0.31, luminance);
        float dimCloud = smoothstep(0.018, 0.13, luminance) * 0.2;

        // A very sparse, stable dusting of sub-pixel stars keeps the photograph
        // connected to the procedural star field without turning it into neon.
        vec2 starGrid = floor(vUv * vec2(820.0, 255.0));
        float starSeed = hash21(starGrid);
        float star = smoothstep(0.9965, 1.0, starSeed);
        float twinkle = 0.76 + 0.24 * sin(time * 0.42 + starSeed * 31.0);
        star *= twinkle * mix(0.78, 1.0, clamp(viewportAspect, 0.45, 1.0));

        vec3 color = texel.rgb * tint * 1.16;
        color += vec3(0.62, 0.75, 1.0) * star * 0.3;
        float alpha = (structure * 0.84 + dimCloud + star * 0.24) * feather * opacity;

        if (alpha < 0.001) discard;
        gl_FragColor = vec4(color, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = 'Milky Way panoramic arc';
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  root.add(mesh);

  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin('anonymous');
  loader.load(
    texturePath,
    (nextTexture) => {
      if (disposed) {
        nextTexture.dispose();
        return;
      }
      nextTexture.colorSpace = THREE.SRGBColorSpace;
      nextTexture.wrapS = THREE.ClampToEdgeWrapping;
      nextTexture.wrapT = THREE.ClampToEdgeWrapping;
      nextTexture.minFilter = THREE.LinearMipmapLinearFilter;
      nextTexture.magFilter = THREE.LinearFilter;
      nextTexture.anisotropy = Math.max(1, anisotropy);
      texture.dispose();
      texture = nextTexture;
      uniforms.map.value = texture;
      loaded = true;
      if (typeof onLoad === 'function') onLoad(texture);
    },
    undefined,
    (error) => {
      if (!disposed && typeof onError === 'function') onError(error);
    }
  );

  function resize(width = window.innerWidth, heightValue = window.innerHeight) {
    viewportAspect = width / Math.max(heightValue, 1);
    uniforms.viewportAspect.value = viewportAspect;
    // A little extra vertical coverage keeps the band present behind portrait UI.
    mesh.scale.y = viewportAspect < 0.8 ? 1.12 : 1;
  }

  function setVisibility(value) {
    if (typeof value === 'boolean') {
      masterOpacity = value ? Math.max(masterOpacity, 0.86) : 0;
    } else {
      masterOpacity = clamp(Number(value) || 0, 0, 1);
    }
    if (masterOpacity === 0) root.visible = false;
    return masterOpacity;
  }

  function setMotionEnabled(value) {
    motionEnabled = Boolean(value);
  }

  function update(delta = 0, scale = 0) {
    const safeDelta = clamp(Number(delta) || 0, 0, 0.05);
    if (motionEnabled) elapsed += safeDelta;
    uniforms.time.value = elapsed;

    const scaleOpacity = visibilityForScale(Number(scale) || 0);
    const nextOpacity = loaded ? scaleOpacity * masterOpacity : 0;
    uniforms.opacity.value = nextOpacity;
    root.visible = nextOpacity > 0.001;

    if (motionEnabled) {
      root.rotation.y = Math.sin(elapsed * 0.018) * 0.009;
    }
    return nextOpacity;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    root.removeFromParent();
    geometry.dispose();
    material.dispose();
    texture.dispose();
  }

  resize();

  return {
    root,
    mesh,
    material,
    update,
    resize,
    dispose,
    setVisibility,
    setMotionEnabled,
    get opacity() {
      return masterOpacity;
    },
    set opacity(value) {
      setVisibility(value);
    },
    get loaded() {
      return loaded;
    }
  };
}
