import * as THREE from 'three';

/**
 * Near-real-time Earth support for Scale Beyond.
 *
 * The two clocks in this module are deliberately independent:
 * - sunlight/terminator geometry is calculated from the current UTC instant;
 * - the surface image is the newest usable daily NASA GIBS observation.
 *
 * GIBS corrected-reflectance imagery normally trails real time and already
 * contains observed cloud cover. UI copy should therefore say "near-real-time
 * satellite image", never imply that the pixels are a live camera feed.
 */

export const GIBS_WMS_ENDPOINT = 'https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi';

export const GIBS_TRUE_COLOR_LAYERS = Object.freeze([
  Object.freeze({
    id: 'VIIRS_SNPP_CorrectedReflectance_TrueColor',
    label: 'VIIRS Suomi NPP true color',
    satellite: 'Suomi NPP'
  }),
  Object.freeze({
    id: 'VIIRS_NOAA20_CorrectedReflectance_TrueColor',
    label: 'VIIRS NOAA-20 true color',
    satellite: 'NOAA-20'
  }),
  Object.freeze({
    id: 'MODIS_Terra_CorrectedReflectance_TrueColor',
    label: 'MODIS Terra true color',
    satellite: 'Terra'
  })
]);

export const GIBS_ATTRIBUTION = Object.freeze({
  provider: 'NASA Global Imagery Browse Services (GIBS)',
  short: 'NASA GIBS',
  url: 'https://www.earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs',
  authentication: 'none',
  nearRealTime: true,
  includesObservedClouds: true
});

/**
 * GIBS daily mosaics can contain black no-data wedges around the date line and
 * polar swath edges. Keep the static Blue Marble as `staticSurface`, sample the
 * GIBS texture as `liveSurface`, then call:
 *
 *   color = blendLiveEarthSurface(staticSurface, liveSurface, liveTextureMix);
 *
 * The deliberately soft low-luminance gate lets genuinely dark ocean retain a
 * little static underlay instead of turning missing-data pixels into black cuts.
 */
export const LIVE_EARTH_SHADER_CHUNK = `
  float liveEarthCoverage(vec3 liveColor) {
    float brightest = max(liveColor.r, max(liveColor.g, liveColor.b));
    float darkest = min(liveColor.r, min(liveColor.g, liveColor.b));
    float luminance = dot(liveColor, vec3(0.2126, 0.7152, 0.0722));
    float signal = max(brightest, luminance + (brightest - darkest) * 0.16);
    return smoothstep(0.006, 0.045, signal);
  }

  vec3 blendLiveEarthSurface(vec3 staticSurface, vec3 liveSurface, float liveMix) {
    float coverage = liveEarthCoverage(liveSurface);
    return mix(staticSurface, liveSurface, coverage * clamp(liveMix, 0.0, 1.0));
  }
`;

export const LIVE_EARTH_COVERAGE_GUIDE = Object.freeze({
  requiresFallbackUnderlay: true,
  method: 'shader-luminance-mask',
  blackLevel: 0.006,
  fullCoverageLevel: 0.045,
  shaderChunk: LIVE_EARTH_SHADER_CHUNK
});

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const MEBIBYTE = 1024 * 1024;
const DEFAULT_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DEFAULT_SOLAR_INTERVAL_MS = 1000;

const blobCache = new Map();
let blobCacheBytes = 0;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function clampInteger(value, min, max, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? clamp(Math.round(parsed), min, max) : fallback;
}

function positiveNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function normalizeLongitude(value) {
  return ((value + 180) % 360 + 360) % 360 - 180;
}

function toDate(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new RangeError('A valid date is required.');
  }
  return date;
}

export function formatUtcDate(value = new Date()) {
  return toDate(value).toISOString().slice(0, 10);
}

function createNamedError(message, name = 'Error', code = '') {
  const error = new Error(message);
  error.name = name;
  if (code) error.code = code;
  return error;
}

function errorSummary(error, candidate = null) {
  return Object.freeze({
    name: error?.name || 'Error',
    code: error?.code || '',
    message: error?.message || String(error),
    date: candidate?.date || null,
    layer: candidate?.layer || null,
    url: candidate?.url || null
  });
}

/**
 * NOAA-style low-cost solar ephemeris.
 *
 * Accuracy is comfortably within what a rendered terminator needs (normally a
 * small fraction of a degree). `earthFixedDirection` is a unit vector pointing
 * from Earth's center toward the Sun in the equirectangular texture frame:
 * +Y north, longitude 0 at +X, east longitude toward -Z. That convention
 * matches THREE.SphereGeometry's default UV layout.
 */
export function calculateSolarEphemeris(value = new Date(), options = {}) {
  const date = toDate(value);
  const julianDay = date.getTime() / 86400000 + 2440587.5;
  const julianCentury = (julianDay - 2451545) / 36525;

  const geometricMeanLongitude = normalizeDegrees(
    280.46646 + julianCentury * (36000.76983 + julianCentury * 0.0003032)
  );
  const geometricMeanAnomaly = normalizeDegrees(
    357.52911 + julianCentury * (35999.05029 - 0.0001537 * julianCentury)
  );
  const eccentricity = 0.016708634
    - julianCentury * (0.000042037 + 0.0000001267 * julianCentury);
  const anomalyRadians = geometricMeanAnomaly * DEG_TO_RAD;
  const equationOfCenter = Math.sin(anomalyRadians)
      * (1.914602 - julianCentury * (0.004817 + 0.000014 * julianCentury))
    + Math.sin(2 * anomalyRadians) * (0.019993 - 0.000101 * julianCentury)
    + Math.sin(3 * anomalyRadians) * 0.000289;
  const trueLongitude = geometricMeanLongitude + equationOfCenter;
  const trueAnomaly = geometricMeanAnomaly + equationOfCenter;
  const omega = 125.04 - 1934.136 * julianCentury;
  const apparentLongitude = trueLongitude - 0.00569 - 0.00478 * Math.sin(omega * DEG_TO_RAD);

  const meanObliquity = 23 + (
    26 + (
      21.448 - julianCentury * (
        46.815 + julianCentury * (0.00059 - julianCentury * 0.001813)
      )
    ) / 60
  ) / 60;
  const correctedObliquity = meanObliquity + 0.00256 * Math.cos(omega * DEG_TO_RAD);
  const obliquityRadians = correctedObliquity * DEG_TO_RAD;
  const apparentLongitudeRadians = apparentLongitude * DEG_TO_RAD;
  const declinationRadians = Math.asin(
    Math.sin(obliquityRadians) * Math.sin(apparentLongitudeRadians)
  );
  const rightAscensionRadians = Math.atan2(
    Math.cos(obliquityRadians) * Math.sin(apparentLongitudeRadians),
    Math.cos(apparentLongitudeRadians)
  );

  const y = Math.tan(obliquityRadians / 2) ** 2;
  const meanLongitudeRadians = geometricMeanLongitude * DEG_TO_RAD;
  const equationOfTimeRadians = y * Math.sin(2 * meanLongitudeRadians)
    - 2 * eccentricity * Math.sin(anomalyRadians)
    + 4 * eccentricity * y * Math.sin(anomalyRadians) * Math.cos(2 * meanLongitudeRadians)
    - 0.5 * y * y * Math.sin(4 * meanLongitudeRadians)
    - 1.25 * eccentricity * eccentricity * Math.sin(2 * anomalyRadians);
  const equationOfTimeMinutes = 4 * equationOfTimeRadians * RAD_TO_DEG;

  const utcMinutes = date.getUTCHours() * 60
    + date.getUTCMinutes()
    + date.getUTCSeconds() / 60
    + date.getUTCMilliseconds() / 60000;
  const astronomicalLongitude = normalizeLongitude((720 - utcMinutes - equationOfTimeMinutes) / 4);
  const longitudeOffsetDegrees = Number(options.longitudeOffsetDegrees) || 0;
  const textureLongitude = normalizeLongitude(astronomicalLongitude + longitudeOffsetDegrees);
  const textureLongitudeRadians = textureLongitude * DEG_TO_RAD;
  const cosLatitude = Math.cos(declinationRadians);

  const earthFixedDirection = Object.freeze({
    x: cosLatitude * Math.cos(textureLongitudeRadians),
    y: Math.sin(declinationRadians),
    z: -cosLatitude * Math.sin(textureLongitudeRadians)
  });

  const solarDistanceAu = (
    1.000001018 * (1 - eccentricity * eccentricity)
  ) / (
    1 + eccentricity * Math.cos(trueAnomaly * DEG_TO_RAD)
  );

  return Object.freeze({
    utc: date.toISOString(),
    julianDay,
    rightAscensionDegrees: normalizeDegrees(rightAscensionRadians * RAD_TO_DEG),
    declinationDegrees: declinationRadians * RAD_TO_DEG,
    equationOfTimeMinutes,
    subsolarLatitudeDegrees: declinationRadians * RAD_TO_DEG,
    subsolarLongitudeDegrees: astronomicalLongitude,
    textureSubsolarLongitudeDegrees: textureLongitude,
    solarDistanceAu,
    earthFixedDirection
  });
}

/** Build one official, global EPSG:4326 GIBS WMS request. */
export function buildGibsWmsUrl({
  layer = GIBS_TRUE_COLOR_LAYERS[0].id,
  date = new Date(),
  width = 2048,
  height = 1024,
  endpoint = GIBS_WMS_ENDPOINT,
  format = 'image/jpeg'
} = {}) {
  const layerId = typeof layer === 'string' ? layer : layer?.id;
  if (!layerId) throw new TypeError('A NASA GIBS layer id is required.');

  const safeWidth = clampInteger(width, 256, 4096, 2048);
  const safeHeight = clampInteger(height, 128, 2048, Math.round(safeWidth / 2));
  const url = new URL(endpoint);
  const parameters = {
    SERVICE: 'WMS',
    REQUEST: 'GetMap',
    VERSION: '1.3.0',
    LAYERS: layerId,
    STYLES: '',
    FORMAT: format,
    TRANSPARENT: 'FALSE',
    WIDTH: String(safeWidth),
    HEIGHT: String(safeHeight),
    CRS: 'EPSG:4326',
    // WMS 1.3.0 uses latitude,longitude axis order for EPSG:4326.
    BBOX: '-90,-180,90,180',
    TIME: formatUtcDate(date)
  };
  Object.entries(parameters).forEach(([key, parameter]) => url.searchParams.set(key, parameter));
  return url.toString();
}

/**
 * Candidate order is date-first, then satellite: yesterday's Suomi NPP,
 * yesterday's NOAA-20, then older dates. Starting one UTC day behind avoids
 * accepting an incomplete current-day swath as a global texture.
 */
export function buildGibsCandidates({
  date = new Date(),
  lagDays = 1,
  lookbackDays = 5,
  layers = GIBS_TRUE_COLOR_LAYERS,
  width = 2048,
  height = 1024,
  endpoint = GIBS_WMS_ENDPOINT
} = {}) {
  const anchor = toDate(date);
  const utcMidnight = Date.UTC(
    anchor.getUTCFullYear(),
    anchor.getUTCMonth(),
    anchor.getUTCDate()
  );
  const safeLag = clampInteger(lagDays, 0, 7, 1);
  const safeLookback = clampInteger(lookbackDays, 1, 14, 5);
  const safeLayers = [...layers]
    .map((layer) => typeof layer === 'string'
      ? { id: layer, label: layer, satellite: layer }
      : layer)
    .filter((layer) => layer?.id)
    .slice(0, 4);
  if (safeLayers.length === 0) throw new TypeError('At least one NASA GIBS layer is required.');

  const candidates = [];
  for (let dayIndex = 0; dayIndex < safeLookback; dayIndex += 1) {
    const candidateDate = new Date(utcMidnight - (safeLag + dayIndex) * 86400000);
    for (const layer of safeLayers) {
      candidates.push(Object.freeze({
        provider: 'NASA GIBS',
        date: formatUtcDate(candidateDate),
        layer: layer.id,
        label: layer.label || layer.id,
        satellite: layer.satellite || layer.label || layer.id,
        width: clampInteger(width, 256, 4096, 2048),
        height: clampInteger(height, 128, 2048, 1024),
        includesObservedClouds: true,
        requiresFallbackUnderlay: true,
        coverageFallback: 'shader-luminance-mask',
        url: buildGibsWmsUrl({
          layer: layer.id,
          date: candidateDate,
          width,
          height,
          endpoint
        })
      }));
    }
  }
  return Object.freeze(candidates);
}

/**
 * Returns a concrete GPU/network budget. Mobile intentionally stays at 1K;
 * a single decoded 1K equirectangular map is about 2 MiB before mipmaps.
 */
export function getLiveEarthResourceBudget(options = {}) {
  const browserNavigator = typeof navigator === 'undefined' ? {} : navigator;
  const browserWindow = typeof window === 'undefined' ? null : window;
  const memory = positiveNumber(options.deviceMemory, positiveNumber(browserNavigator.deviceMemory, 8));
  const cores = positiveNumber(options.hardwareConcurrency, positiveNumber(browserNavigator.hardwareConcurrency, 8));
  const pixelRatio = positiveNumber(options.devicePixelRatio, positiveNumber(browserWindow?.devicePixelRatio, 1));
  const viewportWidth = positiveNumber(options.viewportWidth, positiveNumber(browserWindow?.innerWidth, 1440));
  const saveData = options.saveData ?? Boolean(browserNavigator.connection?.saveData);
  const compact = options.compact ?? (
    viewportWidth < 760 || Boolean(browserWindow?.matchMedia?.('(pointer: coarse)').matches)
  );
  const requestedQuality = ['constrained', 'balanced', 'high'].includes(options.quality)
    ? options.quality
    : 'auto';

  let tier;
  if (requestedQuality !== 'auto') {
    tier = requestedQuality;
  } else if (compact || saveData || memory <= 4 || cores <= 4) {
    tier = 'constrained';
  } else if (memory >= 8 && cores >= 8 && pixelRatio >= 1.25) {
    tier = 'high';
  } else {
    tier = 'balanced';
  }

  const profiles = {
    constrained: {
      width: 1024,
      height: 512,
      anisotropy: 2,
      generateMipmaps: false,
      layerCount: 1,
      lookbackDays: 4,
      maxAttempts: 4,
      timeoutMs: 9000,
      overallTimeoutMs: 26000,
      cacheEntries: 1,
      cacheBytes: 6 * MEBIBYTE,
      refreshIntervalMs: 8 * 60 * 60 * 1000
    },
    balanced: {
      width: 2048,
      height: 1024,
      anisotropy: 4,
      generateMipmaps: true,
      layerCount: 2,
      lookbackDays: 5,
      maxAttempts: 6,
      timeoutMs: 12000,
      overallTimeoutMs: 36000,
      cacheEntries: 2,
      cacheBytes: 18 * MEBIBYTE,
      refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS
    },
    high: {
      width: 4096,
      height: 2048,
      anisotropy: 8,
      generateMipmaps: true,
      layerCount: 3,
      lookbackDays: 5,
      maxAttempts: 8,
      timeoutMs: 18000,
      overallTimeoutMs: 48000,
      cacheEntries: 2,
      cacheBytes: 32 * MEBIBYTE,
      refreshIntervalMs: DEFAULT_REFRESH_INTERVAL_MS
    }
  };
  const profile = profiles[tier];
  const mipFactor = profile.generateMipmaps ? 4 / 3 : 1;
  const estimatedTextureMemoryMiB = profile.width * profile.height * 4 * mipFactor / MEBIBYTE;

  return Object.freeze({
    tier,
    compact,
    saveData,
    width: profile.width,
    height: profile.height,
    anisotropy: profile.anisotropy,
    generateMipmaps: profile.generateMipmaps,
    layerCount: profile.layerCount,
    lookbackDays: profile.lookbackDays,
    maxAttempts: profile.maxAttempts,
    timeoutMs: profile.timeoutMs,
    overallTimeoutMs: profile.overallTimeoutMs,
    cacheEntries: profile.cacheEntries,
    cacheBytes: profile.cacheBytes,
    refreshIntervalMs: profile.refreshIntervalMs,
    estimatedTextureMemoryMiB: Number(estimatedTextureMemoryMiB.toFixed(1)),
    recommendation: tier === 'constrained'
      ? 'Keep one 1024x512 live map, no mip chain, and retain the static Blue Marble fallback.'
      : tier === 'high'
        ? 'Load 4096x2048 only on capable desktop hardware; keep one previous good texture at most.'
        : 'Use 2048x1024 with mipmaps as the default desktop quality/performance balance.'
  });
}

function touchCacheEntry(key) {
  const record = blobCache.get(key);
  if (!record) return null;
  blobCache.delete(key);
  record.lastAccessedAt = Date.now();
  blobCache.set(key, record);
  return record;
}

function pruneBlobCache(maxEntries, maxBytes) {
  while (blobCache.size > maxEntries || blobCacheBytes > maxBytes) {
    const oldestKey = blobCache.keys().next().value;
    if (oldestKey === undefined) break;
    const record = blobCache.get(oldestKey);
    blobCache.delete(oldestKey);
    blobCacheBytes -= record?.bytes || 0;
  }
  blobCacheBytes = Math.max(blobCacheBytes, 0);
}

function cacheBlob(key, record, limits) {
  if (!record?.blob || record.bytes > limits.maxBytes) return;
  const previous = blobCache.get(key);
  if (previous) blobCacheBytes -= previous.bytes || 0;
  blobCache.delete(key);
  blobCache.set(key, { ...record, lastAccessedAt: Date.now() });
  blobCacheBytes += record.bytes;
  pruneBlobCache(limits.maxEntries, limits.maxBytes);
}

export function getLiveEarthCacheState() {
  return Object.freeze({
    entries: blobCache.size,
    bytes: blobCacheBytes,
    mebibytes: Number((blobCacheBytes / MEBIBYTE).toFixed(2)),
    urls: Object.freeze([...blobCache.keys()])
  });
}

export function clearLiveEarthCache() {
  blobCache.clear();
  blobCacheBytes = 0;
  return getLiveEarthCacheState();
}

function createAbortScope(externalSignal, timeoutMs) {
  const controller = new AbortController();
  const abortFromExternal = () => controller.abort(
    externalSignal.reason || createNamedError('Live Earth request was cancelled.', 'AbortError', 'ABORTED')
  );
  if (externalSignal?.aborted) abortFromExternal();
  else externalSignal?.addEventListener('abort', abortFromExternal, { once: true });

  const timer = setTimeout(() => {
    controller.abort(createNamedError(
      `NASA GIBS did not respond within ${timeoutMs} ms.`,
      'TimeoutError',
      'TIMEOUT'
    ));
  }, timeoutMs);

  return {
    signal: controller.signal,
    dispose() {
      clearTimeout(timer);
      externalSignal?.removeEventListener('abort', abortFromExternal);
    }
  };
}

async function fetchCandidateBlob(candidate, signal) {
  const cached = touchCacheEntry(candidate.url);
  if (cached) return { ...cached, cacheHit: true };

  const response = await fetch(candidate.url, {
    method: 'GET',
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'follow',
    signal
  });
  if (!response.ok) {
    const error = new Error(`NASA GIBS returned HTTP ${response.status}.`);
    error.code = 'HTTP_ERROR';
    throw error;
  }

  const contentType = (response.headers.get('content-type') || '').toLowerCase();
  if (!contentType.startsWith('image/')) {
    const error = new Error(`NASA GIBS returned ${contentType || 'an unknown content type'} instead of an image.`);
    error.code = 'NOT_AN_IMAGE';
    throw error;
  }

  const blob = await response.blob();
  if (blob.size < 1024) {
    const error = new Error('NASA GIBS returned an empty or placeholder-sized image.');
    error.code = 'EMPTY_IMAGE';
    throw error;
  }
  return {
    blob,
    bytes: blob.size,
    contentType,
    responseUrl: response.url,
    cacheHit: false
  };
}

function decodeBlobImage(blob, signal) {
  if (
    typeof Image === 'undefined'
    || typeof URL === 'undefined'
    || typeof URL.createObjectURL !== 'function'
  ) {
    return Promise.reject(new Error('Live Earth texture decoding requires a browser Image implementation.'));
  }

  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(blob);
    const image = new Image();
    image.decoding = 'async';

    const cleanup = () => {
      image.onload = null;
      image.onerror = null;
      signal?.removeEventListener('abort', abort);
      URL.revokeObjectURL(objectUrl);
    };
    const abort = () => {
      image.src = '';
      cleanup();
      reject(signal.reason || createNamedError('Image decoding was cancelled.', 'AbortError', 'ABORTED'));
    };
    image.onload = () => {
      cleanup();
      resolve(image);
    };
    image.onerror = () => {
      cleanup();
      const error = new Error('The NASA GIBS image could not be decoded.');
      error.code = 'DECODE_ERROR';
      reject(error);
    };
    if (signal?.aborted) {
      abort();
      return;
    }
    signal?.addEventListener('abort', abort, { once: true });
    image.src = objectUrl;
  });
}

function createSamplingCanvas(width, height) {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
  if (typeof document !== 'undefined') {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    return canvas;
  }
  throw new Error('Image validation requires Canvas or OffscreenCanvas support.');
}

/** Reject the all-black 200 responses GIBS uses for dates with no usable swath. */
function inspectImageCoverage(image) {
  const sourceWidth = image.naturalWidth || image.width;
  const sourceHeight = image.naturalHeight || image.height;
  if (sourceWidth < 256 || sourceHeight < 128) {
    const error = new Error(`NASA GIBS image dimensions are unexpectedly small (${sourceWidth}x${sourceHeight}).`);
    error.code = 'SMALL_IMAGE';
    throw error;
  }

  const width = 64;
  const height = 32;
  const canvas = createSamplingCanvas(width, height);
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Could not create a canvas context for NASA image validation.');
  context.drawImage(image, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;

  let visiblePixels = 0;
  let sum = 0;
  let sumSquared = 0;
  let minimum = 255;
  let maximum = 0;
  for (let index = 0; index < pixels.length; index += 4) {
    const red = pixels[index];
    const green = pixels[index + 1];
    const blue = pixels[index + 2];
    const brightest = Math.max(red, green, blue);
    const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
    if (brightest > 12) visiblePixels += 1;
    sum += luminance;
    sumSquared += luminance * luminance;
    minimum = Math.min(minimum, luminance);
    maximum = Math.max(maximum, luminance);
  }

  const count = width * height;
  const mean = sum / count;
  const standardDeviation = Math.sqrt(Math.max(sumSquared / count - mean * mean, 0));
  const visibleRatio = visiblePixels / count;
  const dynamicRange = maximum - minimum;
  if (visibleRatio < 0.018 || standardDeviation < 3.2 || dynamicRange < 18) {
    const error = new Error('NASA GIBS returned a blank or incomplete no-data image; trying an older UTC date.');
    error.code = 'NO_DATA';
    throw error;
  }

  return Object.freeze({
    sourceWidth,
    sourceHeight,
    visibleRatio: Number(visibleRatio.toFixed(4)),
    standardDeviation: Number(standardDeviation.toFixed(2)),
    dynamicRange: Number(dynamicRange.toFixed(2))
  });
}

function createThreeTexture(image, candidate, budget, renderer) {
  const texture = new THREE.Texture(image);
  const maximumAnisotropy = renderer?.capabilities?.getMaxAnisotropy?.() || budget.anisotropy;
  texture.name = `NASA GIBS · ${candidate.satellite} · ${candidate.date}`;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = budget.generateMipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
  texture.generateMipmaps = budget.generateMipmaps;
  texture.anisotropy = Math.min(maximumAnisotropy, budget.anisotropy);
  texture.needsUpdate = true;
  texture.userData.liveEarth = Object.freeze({
    provider: candidate.provider,
    layer: candidate.layer,
    satellite: candidate.satellite,
    date: candidate.date,
    url: candidate.url,
    nearRealTime: true,
    includesObservedClouds: true,
    requiresFallbackUnderlay: true,
    coverageFallback: 'shader-luminance-mask'
  });
  return texture;
}

async function loadCandidateTexture(candidate, options) {
  const scope = createAbortScope(options.signal, options.budget.timeoutMs);
  try {
    const blobRecord = await fetchCandidateBlob(candidate, scope.signal);
    const image = await decodeBlobImage(blobRecord.blob, scope.signal);
    const inspection = inspectImageCoverage(image);
    if (!blobRecord.cacheHit) {
      cacheBlob(candidate.url, blobRecord, {
        maxEntries: options.budget.cacheEntries,
        maxBytes: options.budget.cacheBytes
      });
    }
    return {
      texture: createThreeTexture(image, candidate, options.budget, options.renderer),
      metadata: Object.freeze({
        ...candidate,
        bytes: blobRecord.bytes,
        contentType: blobRecord.contentType,
        responseUrl: blobRecord.responseUrl,
        cacheHit: blobRecord.cacheHit,
        inspection
      })
    };
  } finally {
    scope.dispose();
  }
}

function vectorTargetValue(target) {
  return target?.value?.set ? target.value : target;
}

function writeDirectionTarget(target, vector, ephemeris) {
  if (typeof target === 'function') {
    target(vector, ephemeris);
    return;
  }
  const value = vectorTargetValue(target);
  if (value?.copy) value.copy(vector);
  else if (value?.set) value.set(vector.x, vector.y, vector.z);
  else if (value && typeof value === 'object') {
    value.x = vector.x;
    value.y = vector.y;
    value.z = vector.z;
  }
}

export function formatLiveEarthStatus(state, locale = 'zh-CN') {
  const chinese = String(locale).toLowerCase().startsWith('zh');
  const date = state?.currentCandidate?.date || state?.date || '';
  if (chinese) {
    if (state?.phase === 'loading') return `NASA GIBS · 正在匹配 ${date || '最新'} 卫星影像`;
    if (state?.phase === 'ready') return `NASA GIBS · 近实时地球 · UTC ${date}`;
    if (state?.phase === 'stale') return `NASA GIBS · 最近可用影像 · UTC ${date}`;
    if (state?.phase === 'fallback') return 'NASA GIBS 暂不可用 · STATIC BLUE MARBLE';
    if (state?.phase === 'disposed') return 'NASA GIBS · OFFLINE';
    return 'NASA GIBS · STANDBY';
  }
  if (state?.phase === 'loading') return `NASA GIBS · CHECKING ${date || 'LATEST'} IMAGERY`;
  if (state?.phase === 'ready') return `NASA GIBS · NEAR-REAL-TIME EARTH · UTC ${date}`;
  if (state?.phase === 'stale') return `NASA GIBS · LAST AVAILABLE IMAGE · UTC ${date}`;
  if (state?.phase === 'fallback') return 'NASA GIBS UNAVAILABLE · STATIC BLUE MARBLE';
  if (state?.phase === 'disposed') return 'NASA GIBS · OFFLINE';
  return 'NASA GIBS · STANDBY';
}

/**
 * Creates a safe, opt-in Live Earth controller.
 *
 * Integration points:
 * - `update(date)` once per animation frame writes the current solar direction;
 * - `refresh()` loads the newest valid GIBS texture and calls `applyTexture`;
 * - `subscribe()` exposes loading/ready/stale/fallback state to the existing UI;
 * - the supplied fallback texture is never disposed or replaced on a failed load.
 */
export function createLiveEarthController(options = {}) {
  const budget = getLiveEarthResourceBudget({
    ...(options.budget || {}),
    compact: options.compact ?? options.budget?.compact,
    quality: options.quality ?? options.budget?.quality
  });
  const layers = (options.layers || GIBS_TRUE_COLOR_LAYERS).slice(0, budget.layerCount);
  const renderer = options.renderer || null;
  const earthObject = options.earthObject || null;
  const directionTargets = [...(options.sunDirectionTargets || [])];
  const lightDistance = positiveNumber(options.lightDistance, 42);
  const longitudeOffsetDegrees = Number(options.longitudeOffsetDegrees) || 0;
  const solarIntervalMs = positiveNumber(options.solarIntervalMs, DEFAULT_SOLAR_INTERVAL_MS);
  const refreshIntervalMs = positiveNumber(options.refreshIntervalMs, budget.refreshIntervalMs);
  const listeners = new Set();
  const localDirection = new THREE.Vector3();
  const worldDirection = new THREE.Vector3();
  const worldQuaternion = new THREE.Quaternion();
  const earthWorldPosition = new THREE.Vector3();

  let disposed = false;
  let activeTexture = options.fallbackTexture || null;
  let activeTextureOwned = false;
  let refreshPromise = null;
  let refreshAbortController = null;
  let refreshRevision = 0;
  let refreshTimer = null;
  let ephemeris = null;
  let lastSolarCalculationMs = Number.NEGATIVE_INFINITY;

  const state = {
    phase: 'idle',
    source: activeTexture ? 'fallback' : null,
    date: null,
    layer: null,
    satellite: null,
    url: null,
    bytes: 0,
    cacheHit: false,
    attempt: 0,
    candidateCount: 0,
    currentCandidate: null,
    lastAttemptAt: null,
    lastSuccessAt: null,
    error: null,
    failures: []
  };

  function snapshot() {
    return Object.freeze({
      ...state,
      currentCandidate: state.currentCandidate ? { ...state.currentCandidate } : null,
      failures: Object.freeze([...state.failures]),
      solar: ephemeris,
      budget,
      cache: getLiveEarthCacheState(),
      statusText: formatLiveEarthStatus(state, options.locale || 'zh-CN')
    });
  }

  function emit() {
    const nextState = snapshot();
    listeners.forEach((listener) => {
      try {
        listener(nextState);
      } catch (error) {
        // A status consumer must never break rendering or texture fallback.
        options.onListenerError?.(error);
      }
    });
    options.onStateChange?.(nextState);
    return nextState;
  }

  function update(value = new Date(), forceSolarCalculation = false) {
    if (disposed) return null;
    const date = toDate(value);
    const time = date.getTime();
    if (
      forceSolarCalculation
      || !ephemeris
      || Math.abs(time - lastSolarCalculationMs) >= solarIntervalMs
    ) {
      ephemeris = calculateSolarEphemeris(date, { longitudeOffsetDegrees });
      lastSolarCalculationMs = time;
      options.onSolarUpdate?.(ephemeris);
    }

    const direction = ephemeris.earthFixedDirection;
    localDirection.set(direction.x, direction.y, direction.z).normalize();
    worldDirection.copy(localDirection);
    if (earthObject?.getWorldQuaternion) {
      earthObject.updateWorldMatrix?.(true, false);
      earthObject.getWorldQuaternion(worldQuaternion);
      worldDirection.applyQuaternion(worldQuaternion).normalize();
    }
    directionTargets.forEach((target) => writeDirectionTarget(target, worldDirection, ephemeris));

    if (options.sunLight?.position) {
      earthWorldPosition.set(0, 0, 0);
      earthObject?.getWorldPosition?.(earthWorldPosition);
      options.sunLight.position.copy(worldDirection).multiplyScalar(lightDistance).add(earthWorldPosition);
      if (options.lightTarget?.position) options.lightTarget.position.copy(earthWorldPosition);
    }
    return { ephemeris, localDirection, worldDirection };
  }

  async function performRefresh(refreshOptions, revision, abortController) {
    const date = toDate(refreshOptions.date || new Date());
    const candidates = buildGibsCandidates({
      date,
      lagDays: refreshOptions.lagDays ?? options.lagDays ?? 1,
      lookbackDays: refreshOptions.lookbackDays ?? options.lookbackDays ?? budget.lookbackDays,
      layers: refreshOptions.layers || layers,
      width: refreshOptions.width || budget.width,
      height: refreshOptions.height || budget.height,
      endpoint: refreshOptions.endpoint || options.endpoint || GIBS_WMS_ENDPOINT
    }).slice(0, clampInteger(
      refreshOptions.maxAttempts ?? options.maxAttempts,
      1,
      16,
      budget.maxAttempts
    ));
    const failures = [];
    state.phase = 'loading';
    state.attempt = 0;
    state.candidateCount = candidates.length;
    state.currentCandidate = candidates[0] || null;
    state.lastAttemptAt = new Date().toISOString();
    state.error = null;
    state.failures = [];
    emit();

    for (let index = 0; index < candidates.length; index += 1) {
      if (disposed || revision !== refreshRevision || abortController.signal.aborted) break;
      const candidate = candidates[index];
      state.attempt = index + 1;
      state.currentCandidate = candidate;
      emit();

      try {
        const loaded = await loadCandidateTexture(candidate, {
          renderer,
          budget,
          signal: abortController.signal
        });
        if (disposed || revision !== refreshRevision || abortController.signal.aborted) {
          loaded.texture.dispose();
          break;
        }

        const previousTexture = activeTexture;
        const previousOwned = activeTextureOwned;
        if (options.applyTexture) {
          const accepted = await options.applyTexture(loaded.texture, loaded.metadata, previousTexture);
          if (accepted === false) {
            loaded.texture.dispose();
            const error = new Error('The host scene declined the NASA GIBS texture.');
            error.code = 'TEXTURE_DECLINED';
            throw error;
          }
        }
        if (disposed || revision !== refreshRevision || abortController.signal.aborted) {
          loaded.texture.dispose();
          break;
        }

        activeTexture = loaded.texture;
        activeTextureOwned = true;
        if (previousOwned && previousTexture && previousTexture !== activeTexture) previousTexture.dispose();
        state.phase = 'ready';
        state.source = 'gibs';
        state.date = loaded.metadata.date;
        state.layer = loaded.metadata.layer;
        state.satellite = loaded.metadata.satellite;
        state.url = loaded.metadata.url;
        state.bytes = loaded.metadata.bytes;
        state.cacheHit = loaded.metadata.cacheHit;
        state.currentCandidate = null;
        state.lastSuccessAt = new Date().toISOString();
        state.error = null;
        state.failures = failures;
        const nextState = emit();
        options.onReady?.(activeTexture, loaded.metadata, nextState);
        return Object.freeze({ texture: activeTexture, metadata: loaded.metadata, state: nextState });
      } catch (error) {
        if (abortController.signal.aborted || error?.name === 'AbortError') break;
        failures.push(errorSummary(error, candidate));
        state.failures = failures;
        state.error = failures[failures.length - 1];
      }
    }

    if (disposed || revision !== refreshRevision) return null;
    state.phase = activeTextureOwned ? 'stale' : 'fallback';
    state.source = activeTextureOwned ? 'gibs' : activeTexture ? 'fallback' : null;
    state.currentCandidate = null;
    state.error = failures[failures.length - 1] || errorSummary(
      abortController.signal.reason || new Error('NASA GIBS refresh was cancelled.')
    );
    state.failures = failures;
    const nextState = emit();
    options.onFallback?.(activeTexture, nextState);
    if (refreshOptions.throwOnFailure) {
      const error = new Error('No usable NASA GIBS daily image was found; the existing Earth texture was kept.');
      error.code = 'ALL_CANDIDATES_FAILED';
      error.failures = failures;
      throw error;
    }
    return Object.freeze({ texture: activeTexture, metadata: null, state: nextState });
  }

  function refresh(refreshOptions = {}) {
    if (disposed) return Promise.resolve(null);
    if (refreshPromise && !refreshOptions.force) return refreshPromise;
    if (
      !refreshOptions.force
      && state.phase === 'ready'
      && state.lastAttemptAt
      && Date.now() - Date.parse(state.lastAttemptAt) < refreshIntervalMs
    ) {
      return Promise.resolve(Object.freeze({ texture: activeTexture, metadata: activeTexture?.userData?.liveEarth || null, state: snapshot() }));
    }

    refreshAbortController?.abort(createNamedError('A newer Live Earth refresh superseded this one.', 'AbortError', 'SUPERSEDED'));
    const abortController = new AbortController();
    refreshAbortController = abortController;
    const revision = ++refreshRevision;
    const overallTimeoutMs = positiveNumber(
      refreshOptions.overallTimeoutMs ?? options.overallTimeoutMs,
      budget.overallTimeoutMs
    );
    const overallTimer = setTimeout(() => {
      abortController.abort(createNamedError(
        `NASA GIBS refresh exceeded its ${overallTimeoutMs} ms overall budget.`,
        'TimeoutError',
        'OVERALL_TIMEOUT'
      ));
    }, overallTimeoutMs);
    const runningPromise = performRefresh(refreshOptions, revision, abortController)
      .finally(() => {
        clearTimeout(overallTimer);
        if (refreshPromise === runningPromise) refreshPromise = null;
        if (refreshAbortController === abortController) refreshAbortController = null;
      });
    refreshPromise = runningPromise;
    return runningPromise;
  }

  function start({ refreshImmediately = true } = {}) {
    if (disposed || refreshTimer) return;
    if (refreshImmediately) void refresh();
    refreshTimer = setInterval(() => void refresh({ force: true }), refreshIntervalMs);
  }

  function stop() {
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = null;
  }

  function subscribe(listener, { emitCurrent = true } = {}) {
    if (typeof listener !== 'function') throw new TypeError('subscribe requires a function.');
    listeners.add(listener);
    if (emitCurrent) listener(snapshot());
    return () => listeners.delete(listener);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    refreshRevision += 1;
    refreshAbortController?.abort(createNamedError('Live Earth controller was disposed.', 'AbortError', 'DISPOSED'));
    refreshAbortController = null;
    if (activeTextureOwned && activeTexture) activeTexture.dispose();
    activeTexture = null;
    activeTextureOwned = false;
    state.phase = 'disposed';
    state.currentCandidate = null;
    emit();
    listeners.clear();
  }

  update(new Date(), true);

  return Object.freeze({
    budget,
    update,
    refresh,
    start,
    stop,
    subscribe,
    getState: snapshot,
    getTexture: () => activeTexture,
    getSolarFrame: () => ({ ephemeris, localDirection, worldDirection }),
    dispose
  });
}
