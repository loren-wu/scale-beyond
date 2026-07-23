import * as THREE from 'three';

const DEFAULT_TEXTURE = 'assets/cosmic/milky-way-sky-band-v1.jpg';
const NASA_STRUCTURE_TEXTURE = 'assets/nasa/milky-way-glimpse360-4096.webp';

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
  root.rotation.set(-0.035, 0, THREE.MathUtils.degToRad(-24));
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
  let dataTexture = createPlaceholderTexture();
  let loaded = false;
  let dataLoaded = false;
  let disposed = false;
  let elapsed = 0;
  let masterOpacity = 0.86;
  let motionEnabled = true;
  let viewportAspect = 1;

  const uniforms = {
    map: { value: texture },
    dataMap: { value: dataTexture },
    dataMix: { value: 0 },
    opacity: { value: 0 },
    time: { value: 0 },
    viewportAspect: { value: viewportAspect },
    detail: { value: compact ? 0 : 1 }
  };

  const material = new THREE.ShaderMaterial({
    name: 'Milky Way sky band material',
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
    side: THREE.BackSide,
    // Normal blending preserves the dust rift and the black level of space.
    // The old fully-additive pass made every overlapping cloud trend to white.
    blending: THREE.NormalBlending,
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
      uniform sampler2D dataMap;
      uniform float dataMix;
      uniform float opacity;
      uniform float time;
      uniform float viewportAspect;
      uniform float detail;
      varying vec2 vUv;

      float hash21(vec2 point) {
        point = fract(point * vec2(123.34, 456.21));
        point += dot(point, point + 45.32);
        return fract(point.x * point.y);
      }

      float valueNoise(vec2 point) {
        vec2 cell = floor(point);
        vec2 local = fract(point);
        local = local * local * (3.0 - 2.0 * local);
        float a = hash21(cell);
        float b = hash21(cell + vec2(1.0, 0.0));
        float c = hash21(cell + vec2(0.0, 1.0));
        float d = hash21(cell + vec2(1.0, 1.0));
        return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
      }

      float cloudNoise(vec2 point) {
        float value = valueNoise(point) * 0.57;
        value += valueNoise(point * 2.03 + 13.7) * 0.29;
        value += valueNoise(point * 4.11 + 29.1) * 0.14 * mix(0.35, 1.0, detail);
        return value;
      }

      void main() {
        const float PI = 3.14159265359;
        float x = vUv.x;
        float slowDrift = sin(time * 0.021) * 0.0015;

        // Re-map the rectangular source around an uneven, gently curved spine.
        // The broad bow reads at a distance while the two smaller frequencies
        // keep it from looking like a rotated ruler.
        float broadBow = sin((x - 0.08) * PI) * 0.036;
        float midWave = sin(x * 6.28318 + 0.72) * 0.017;
        float fineWave = sin(x * 17.1 + 1.4) * 0.006;
        float centerLine = 0.495 + broadBow - midWave + fineWave;

        float widthNoise = cloudNoise(vec2(x * 5.2 + 3.0, 1.7));
        float widthRhythm = sin(x * 7.4 - 0.8) * 0.055 + sin(x * 15.7) * 0.022;
        float halfWidth = 0.39 * (0.84 + widthNoise * 0.17 + widthRhythm);
        float localY = (vUv.y - centerLine) / max(halfWidth, 0.26);
        vec2 sampleUv = vec2(
          clamp(x + slowDrift, 0.003, 0.997),
          // Crop the source vertically so the photographed galactic plane has
          // enough apparent width to read as a sky feature, not a hairline.
          clamp(0.5 + localY * 0.34, 0.003, 0.997)
        );
        vec4 texel = texture2D(map, sampleUv);
        vec3 upperSample = texture2D(map, vec2(sampleUv.x, clamp(sampleUv.y + 0.014, 0.003, 0.997))).rgb;
        vec3 lowerSample = texture2D(map, vec2(sampleUv.x, clamp(sampleUv.y - 0.014, 0.003, 0.997))).rgb;
        vec3 dataSample = vec3(0.0);
        if (detail > 0.5 && dataMix > 0.001) {
          dataSample = texture2D(
            dataMap,
            vec2(fract(x + 0.17), clamp(0.5 + localY * 0.39, 0.01, 0.99))
          ).rgb;
        }

        float edgeNoise = cloudNoise(vec2(x * 9.0 + 21.0, localY * 2.5 + 8.0));
        float irregularEdge = abs(localY) + (edgeNoise - 0.5) * 0.14;
        float bandFeather = 1.0 - smoothstep(0.61, 1.0, irregularEdge);
        float horizontalFeather = smoothstep(0.012, 0.105, x)
          * (1.0 - smoothstep(0.895, 0.988, x));
        float feather = bandFeather * horizontalFeather;

        float luminance = dot(texel.rgb, vec3(0.2126, 0.7152, 0.0722));
        float localMean = dot((upperSample + lowerSample) * 0.5, vec3(0.2126, 0.7152, 0.0722));
        float localContrast = clamp(0.5 + (luminance - localMean) * 4.2, 0.0, 1.0);
        float structure = smoothstep(0.009, 0.29, luminance) * mix(0.8, 1.05, localContrast);
        float dimCloud = smoothstep(0.01, 0.105, luminance) * 0.2;
        float dataLuminance = dot(dataSample, vec3(0.299, 0.587, 0.114));
        float dataSignal = smoothstep(0.018, 0.31, dataLuminance) * dataMix;

        // A wandering primary rift plus broken secondary filaments create the
        // recognizable dark river through the Milky Way without a hard stripe.
        float dustField = cloudNoise(vec2(x * 11.5 + 2.4, localY * 5.0 + 17.0));
        float dustWander = sin(x * 14.3 + 0.6) * 0.038
          + sin(x * 31.0) * 0.014
          + (dustField - 0.5) * 0.045;
        float dustWidth = 0.105 + cloudNoise(vec2(x * 8.0, 33.0)) * 0.045;
        float mainRift = 1.0 - smoothstep(dustWidth, dustWidth * 2.45, abs(localY - dustWander));
        float upperFilamentCenter = dustWander + 0.21 + sin(x * 20.0) * 0.035;
        float lowerFilamentCenter = dustWander - 0.23 + sin(x * 16.0 + 2.2) * 0.028;
        float upperFilament = (1.0 - smoothstep(0.025, 0.075, abs(localY - upperFilamentCenter)))
          * smoothstep(0.43, 0.72, dustField);
        float lowerFilament = (1.0 - smoothstep(0.02, 0.065, abs(localY - lowerFilamentCenter)))
          * smoothstep(0.5, 0.78, 1.0 - dustField);
        float photographedDust = smoothstep(0.035, 0.18, localMean)
          * (1.0 - smoothstep(0.018, 0.13, luminance));
        float dust = clamp(
          mainRift * 0.7
            + upperFilament * 0.25
            + lowerFilament * 0.21
            + photographedDust * 0.78,
          0.0,
          0.94
        );

        // Warm stellar core, cooler outer clouds and a restrained violet-blue
        // transition mirror the visible-light palette without flattening it.
        float coreX = exp(-pow((x - 0.53) / 0.175, 2.0));
        float coreY = exp(-pow(localY / 0.62, 2.0));
        float warmCore = coreX * coreY;
        float coolCloud = (1.0 - coreX * 0.72) * smoothstep(0.035, 0.3, luminance);
        vec3 coolGrade = vec3(0.88, 0.96, 1.08);
        vec3 warmGrade = vec3(1.08, 0.97, 0.83);
        vec3 grade = mix(vec3(0.96, 0.99, 1.02), coolGrade, coolCloud * 0.3);
        grade = mix(grade, warmGrade, warmCore * 0.46);
        vec3 sourceColor = pow(max(texel.rgb, vec3(0.0)), vec3(0.88));
        float sourceGray = dot(sourceColor, vec3(0.2126, 0.7152, 0.0722));
        sourceColor = mix(vec3(sourceGray), sourceColor, 0.8);
        vec3 color = sourceColor * grade * 1.08;

        // GLIMPSE 360 is infrared survey data. It is used only as a faint
        // structural modulation, converted to a restrained continuum rather
        // than displayed in its scientific false-colour palette.
        vec3 dataGrade = mix(vec3(0.66, 0.73, 0.84), vec3(0.86, 0.73, 0.6), warmCore);
        color *= 1.0 + dataSignal * (dataLuminance - 0.16) * 0.16;
        color += dataGrade * dataSignal * dataLuminance * 0.11;

        float blueNebula = smoothstep(0.54, 0.83, cloudNoise(vec2(x * 7.0 + 41.0, localY * 4.0)))
          * coolCloud * structure;
        float amberNebula = smoothstep(0.58, 0.84, cloudNoise(vec2(x * 9.0 + 7.0, localY * 3.4 + 9.0)))
          * warmCore * structure;
        color += vec3(0.08, 0.14, 0.25) * blueNebula * 0.1;
        color += vec3(0.24, 0.12, 0.045) * amberNebula * 0.09;
        color *= 1.0 - dust * 0.76;

        // Sparse circular specks, not whole bright grid cells. Compact mode uses
        // fewer candidates and skips the finest cloud-noise octave above.
        vec2 starScale = mix(vec2(760.0, 250.0), vec2(840.0, 275.0), detail);
        vec2 starPosition = sampleUv * starScale;
        vec2 starGrid = floor(starPosition);
        vec2 starLocal = fract(starPosition) - 0.5;
        float starSeed = hash21(starGrid);
        float starCandidate = smoothstep(mix(0.99915, 0.99855, detail), 1.0, starSeed);
        float starShape = 1.0 - smoothstep(0.025, 0.14, length(starLocal));
        float twinkle = 0.9 + 0.1 * sin(time * 0.27 + starSeed * 35.0);
        float star = starCandidate * starShape * twinkle
          * mix(0.78, 1.0, clamp(viewportAspect, 0.45, 1.0));
        vec3 starColor = mix(vec3(0.7, 0.82, 1.0), vec3(1.0, 0.83, 0.62), hash21(starGrid + 9.3));
        color += starColor * star * 0.24;

        float cloudAlpha = structure * 0.7 + dimCloud + dataSignal * dataLuminance * 0.06;
        float dustBody = dust * smoothstep(0.025, 0.15, localMean) * 0.11;
        float alpha = (cloudAlpha * (1.0 - dust * 0.12) + dustBody + star * 0.28) * feather * opacity;
        color = min(color, vec3(1.12));

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

  // A very low-weight infrared layer contributes real survey structure while
  // the visible-light panorama remains the authored appearance and fallback.
  if (!compact) {
    loader.load(
      NASA_STRUCTURE_TEXTURE,
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
        nextTexture.anisotropy = Math.max(1, Math.min(anisotropy, 4));
        dataTexture.dispose();
        dataTexture = nextTexture;
        uniforms.dataMap.value = dataTexture;
        uniforms.dataMix.value = 0.085;
        dataLoaded = true;
        mesh.userData.nasaStructureLoaded = true;
      },
      undefined,
      () => {
        // Deliberately silent: the visible-light panorama and procedural dust
        // field remain a complete fallback when the optional survey layer fails.
      }
    );
  }

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
    dataTexture.dispose();
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
    },
    get dataLoaded() {
      return dataLoaded;
    }
  };
}
