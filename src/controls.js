const WHEEL_DELTA_LINE = 1;
const WHEEL_DELTA_PAGE = 2;

const DEFAULT_SCALE_SEGMENTS = Object.freeze([
  { scale: 0, step: 34 },
  { scale: 70, step: 48 },
  { scale: 190, step: 72 },
  { scale: 380, step: 118 },
  { scale: 800, step: 124 },
  { scale: 1050, step: 150 },
  { scale: 1450, step: 190 },
  { scale: 1800, step: 205 }
]);

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(a, b, amount) {
  return a + (b - a) * amount;
}

function damp(value, target, response, delta) {
  return lerp(value, target, 1 - Math.exp(-response * delta));
}

function wrapAngle(angle) {
  const turn = Math.PI * 2;
  return ((angle + Math.PI) % turn + turn) % turn - Math.PI;
}

function isEditableTarget(target) {
  if (!(target instanceof Element)) return false;
  const tagName = target.tagName;
  return target.isContentEditable || tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT';
}

function normalizeScaleSegments(segments) {
  const normalized = segments
    .map((segment) => Array.isArray(segment)
      ? { scale: Number(segment[0]), step: Number(segment[1]) }
      : { scale: Number(segment.scale), step: Number(segment.step) })
    .filter((segment) => Number.isFinite(segment.scale) && Number.isFinite(segment.step) && segment.step > 0)
    .sort((a, b) => a.scale - b.scale);

  return normalized.length > 0 ? normalized : DEFAULT_SCALE_SEGMENTS;
}

/**
 * Input controller for Scale Beyond's continuous cosmic zoom.
 *
 * `yaw` and `pitch` are orbit offsets in radians. They never alter the camera's
 * look-at target, so scene rotation stays independent from target translation.
 * Call `update(deltaSeconds)` once per frame and use the returned object directly.
 */
export function createCosmicControls(options = {}) {
  const element = options.element;
  if (!element?.addEventListener) {
    throw new TypeError('createCosmicControls requires an event-capable `element`.');
  }

  const ownerWindow = element.ownerDocument?.defaultView ?? window;
  const keyTarget = options.keyTarget ?? ownerWindow;
  const wheelTarget = options.wheelTarget ?? element;
  const minScale = Number.isFinite(options.minScale) ? options.minScale : 0;
  const maxScale = Number.isFinite(options.maxScale) ? options.maxScale : 1800;
  const homeScale = clamp(Number.isFinite(options.homeScale) ? options.homeScale : 18, minScale, maxScale);
  const initialScale = clamp(Number.isFinite(options.initialScale) ? options.initialScale : homeScale, minScale, maxScale);
  const minPitch = Number.isFinite(options.minPitch) ? options.minPitch : -0.42;
  const maxPitch = Number.isFinite(options.maxPitch) ? options.maxPitch : 0.5;
  const dragSensitivity = Number.isFinite(options.dragSensitivity) ? options.dragSensitivity : 0.0032;
  const touchDragMultiplier = Number.isFinite(options.touchDragMultiplier) ? options.touchDragMultiplier : 1.08;
  const pinchMultiplier = Number.isFinite(options.pinchMultiplier) ? options.pinchMultiplier : 1;
  const zoomDamping = Number.isFinite(options.zoomDamping) ? options.zoomDamping : 10.5;
  const zoomResponse = Number.isFinite(options.zoomResponse) ? options.zoomResponse : 11;
  const orbitDamping = Number.isFinite(options.orbitDamping) ? options.orbitDamping : 7.8;
  const maxOrbitVelocity = Number.isFinite(options.maxOrbitVelocity) ? options.maxOrbitVelocity : 3.2;
  const maxFrameDelta = Number.isFinite(options.maxFrameDelta) ? options.maxFrameDelta : 0.05;
  const lineHeight = Number.isFinite(options.wheelLineHeight) ? options.wheelLineHeight : 16;
  const maxWheelPixels = Number.isFinite(options.maxWheelPixels) ? options.maxWheelPixels : 800;
  const wheelLogUnit = Number.isFinite(options.wheelLogUnit) ? options.wheelLogUnit : 24;
  const wheelDeadZone = Number.isFinite(options.wheelDeadZone) ? Math.max(0, options.wheelDeadZone) : 0.18;
  const wheelCurvePower = Number.isFinite(options.wheelCurvePower) ? Math.max(0.5, options.wheelCurvePower) : 1.16;
  const wheelBurstReset = Number.isFinite(options.wheelBurstReset) ? Math.max(32, options.wheelBurstReset) : 140;
  const targetLeadFactor = Number.isFinite(options.targetLeadFactor) ? Math.max(1, options.targetLeadFactor) : 2.65;
  const keyboardOrbitStep = Number.isFinite(options.keyboardOrbitStep) ? options.keyboardOrbitStep : 0.12;
  const keyboardPitchStep = Number.isFinite(options.keyboardPitchStep) ? options.keyboardPitchStep : 0.08;
  const scaleSegments = normalizeScaleSegments(options.scaleSegments ?? DEFAULT_SCALE_SEGMENTS);
  const motionQuery = options.motionQuery ?? ownerWindow.matchMedia?.('(prefers-reduced-motion: reduce)');
  const previousTouchAction = element.style?.touchAction ?? '';

  let scale = initialScale;
  let targetScale = initialScale;
  let zoomVelocity = 0;
  let yaw = wrapAngle(Number.isFinite(options.initialYaw) ? options.initialYaw : 0);
  let pitch = clamp(Number.isFinite(options.initialPitch) ? options.initialPitch : 0, minPitch, maxPitch);
  let yawVelocity = 0;
  let pitchVelocity = 0;
  let reducedMotion = options.reducedMotion ?? motionQuery?.matches ?? false;
  let interacted = false;
  let isDragging = false;
  let isPinching = false;
  let previousPinchDistance = 0;
  let lastGestureClock = 0;
  let lastWheelClock = 0;
  let lastWheelDirection = 0;
  let wheelResidue = 0;
  let destroyed = false;

  const pointers = new Map();
  const frameState = {};

  if (element.style) element.style.touchAction = 'none';

  function getScaleStep(value = scale) {
    if (value <= scaleSegments[0].scale) return scaleSegments[0].step;

    for (let index = 1; index < scaleSegments.length; index += 1) {
      const previous = scaleSegments[index - 1];
      const next = scaleSegments[index];
      if (value <= next.scale) {
        const amount = (value - previous.scale) / Math.max(next.scale - previous.scale, 1);
        return lerp(previous.step, next.step, clamp(amount, 0, 1));
      }
    }

    return scaleSegments[scaleSegments.length - 1].step;
  }

  function notifyInteract(kind, event) {
    if (interacted) return;
    interacted = true;
    options.onInteract?.({ kind, originalEvent: event });
  }

  function notifyDragChange() {
    options.onDragChange?.(pointers.size > 0, { isDragging, isPinching });
  }

  function settleForReducedMotion() {
    zoomVelocity = 0;
    yawVelocity = 0;
    pitchVelocity = 0;
    wheelResidue = 0;
    lastWheelClock = 0;
    lastWheelDirection = 0;
    scale = targetScale;
  }

  function setReducedMotion(nextValue) {
    const next = Boolean(nextValue);
    if (next === reducedMotion) return;
    reducedMotion = next;
    if (reducedMotion) settleForReducedMotion();
    options.onReducedMotionChange?.(reducedMotion);
  }

  function onMotionPreferenceChange(event) {
    setReducedMotion(event.matches);
  }

  function setTargetScale(nextValue, immediate = reducedMotion) {
    const next = clamp(Number(nextValue) || 0, minScale, maxScale);
    targetScale = next;
    if (immediate) {
      scale = next;
      zoomVelocity = 0;
    }
  }

  function normalizeWheelPixels(event) {
    let pixels = event.deltaY;
    if (event.deltaMode === WHEEL_DELTA_LINE) pixels *= lineHeight;
    else if (event.deltaMode === WHEEL_DELTA_PAGE) {
      pixels *= element.clientHeight || ownerWindow.innerHeight || 800;
    }
    return clamp(pixels, -maxWheelPixels, maxWheelPixels);
  }

  function curveWheelInput(pixels) {
    const magnitude = Math.abs(pixels);
    if (magnitude < 0.001) return 0;
    const denominator = Math.log1p(maxWheelPixels / wheelLogUnit);
    const curved = Math.log1p(magnitude / wheelLogUnit) / denominator;
    return Math.sign(pixels) * Math.pow(clamp(curved, 0, 1), wheelCurvePower);
  }

  function onWheel(event) {
    if (event.cancelable) event.preventDefault();

    const pixels = normalizeWheelPixels(event);
    const magnitude = Math.abs(pixels);
    if (magnitude <= wheelDeadZone) return;
    notifyInteract('wheel', event);

    const now = ownerWindow.performance?.now?.() ?? Date.now();
    const gap = lastWheelClock > 0 ? now - lastWheelClock : wheelBurstReset;
    const direction = Math.sign(pixels);
    if (gap > wheelBurstReset) {
      wheelResidue = 0;
      lastWheelDirection = 0;
    } else if (lastWheelDirection !== 0 && direction !== lastWheelDirection) {
      // Brake an old burst before accepting the opposite direction. This keeps
      // short trackpad reversals from producing a visible tug-of-war.
      wheelResidue = 0;
      zoomVelocity *= 0.34;
    }
    lastWheelClock = now;
    lastWheelDirection = direction;

    const stabilizedPixels = direction * (magnitude - wheelDeadZone);
    let releasedPixels = stabilizedPixels;
    if (Math.abs(stabilizedPixels) < 6) {
      // High-resolution wheels often emit sub-pixel noise. Integrate it into a
      // small burst and release only part per event, retaining deliberate slow
      // gestures without letting sensor chatter shake the camera.
      wheelResidue = clamp(wheelResidue + stabilizedPixels, -maxWheelPixels, maxWheelPixels);
      const releaseRatio = clamp(0.42 + gap / 34, 0.42, 0.76);
      releasedPixels = wheelResidue * releaseRatio;
      wheelResidue -= releasedPixels;
      if (Math.abs(releasedPixels) < 0.24) return;
    } else {
      wheelResidue *= 0.18;
    }

    const curvedDelta = curveWheelInput(releasedPixels);
    if (curvedDelta === 0) return;

    const step = getScaleStep((scale + targetScale) * 0.5);
    if (reducedMotion) {
      setTargetScale(targetScale + curvedDelta * step, true);
      return;
    }

    // An impulse integrates to roughly one stage-tuned `step`; damping makes it
    // feel physical without making high-resolution trackpads hypersensitive.
    if (zoomVelocity !== 0 && Math.sign(zoomVelocity) !== Math.sign(curvedDelta)) zoomVelocity *= 0.42;
    zoomVelocity += curvedDelta * step * zoomDamping;
    const velocityLimit = Math.max(420, step * zoomDamping * 3.5);
    zoomVelocity = clamp(zoomVelocity, -velocityLimit, velocityLimit);
  }

  function getFirstTwoPointers() {
    const iterator = pointers.values();
    return [iterator.next().value, iterator.next().value];
  }

  function pointerDistance(first, second) {
    return Math.hypot(second.x - first.x, second.y - first.y);
  }

  function setPointerMode() {
    const wasDragging = isDragging;
    const wasPinching = isPinching;
    isPinching = pointers.size >= 2;
    isDragging = pointers.size === 1;

    if (isPinching) {
      const [first, second] = getFirstTwoPointers();
      previousPinchDistance = pointerDistance(first, second);
      yawVelocity = 0;
      pitchVelocity = 0;
    } else {
      previousPinchDistance = 0;
    }

    if (wasDragging !== isDragging || wasPinching !== isPinching) notifyDragChange();
  }

  function onPointerDown(event) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.cancelable) event.preventDefault();
    notifyInteract('pointer', event);

    pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
      pointerType: event.pointerType
    });

    try {
      element.setPointerCapture?.(event.pointerId);
    } catch {
      // Capture can fail if the pointer ended between dispatch and this handler.
    }

    yawVelocity = 0;
    pitchVelocity = 0;
    setPointerMode();
  }

  function onPointerMove(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    if (event.cancelable) event.preventDefault();

    const previousX = pointer.x;
    const previousY = pointer.y;
    const eventDelta = clamp((event.timeStamp - pointer.time) / 1000, 0.008, 0.05);
    pointer.x = event.clientX;
    pointer.y = event.clientY;
    pointer.time = event.timeStamp;
    lastGestureClock = ownerWindow.performance?.now?.() ?? Date.now();

    if (pointers.size >= 2) {
      const [first, second] = getFirstTwoPointers();
      const distance = pointerDistance(first, second);
      if (previousPinchDistance > 0) {
        const distanceDelta = distance - previousPinchDistance;
        const scalePerPixel = (getScaleStep(scale) / 110) * pinchMultiplier;
        const scaleDelta = -distanceDelta * scalePerPixel;
        setTargetScale(targetScale + scaleDelta, reducedMotion);
        zoomVelocity = reducedMotion
          ? 0
          : clamp((scaleDelta / eventDelta) * 0.13, -getScaleStep(scale) * 5, getScaleStep(scale) * 5);
      }
      previousPinchDistance = distance;
      return;
    }

    if (!isDragging) return;
    const multiplier = pointer.pointerType === 'touch' ? touchDragMultiplier : 1;
    const yawDelta = -(pointer.x - previousX) * dragSensitivity * multiplier;
    const pitchDelta = (pointer.y - previousY) * dragSensitivity * multiplier;

    // Negative yaw makes a rightward hand movement pull the rendered universe
    // rightward on screen: the camera orbits left, as if the scene were grabbed.
    yaw = wrapAngle(yaw + yawDelta);
    pitch = clamp(pitch + pitchDelta, minPitch, maxPitch);

    if (reducedMotion) {
      yawVelocity = 0;
      pitchVelocity = 0;
      return;
    }

    const rawYawVelocity = clamp(yawDelta / eventDelta, -maxOrbitVelocity, maxOrbitVelocity);
    const rawPitchVelocity = clamp(pitchDelta / eventDelta, -maxOrbitVelocity, maxOrbitVelocity);
    yawVelocity = lerp(yawVelocity, rawYawVelocity, 0.58);
    pitchVelocity = lerp(pitchVelocity, rawPitchVelocity, 0.58);
  }

  function finishPointer(event, cancelled = false) {
    if (!pointers.has(event.pointerId)) return;
    if (event.cancelable) event.preventDefault();
    pointers.delete(event.pointerId);

    try {
      if (element.hasPointerCapture?.(event.pointerId)) element.releasePointerCapture(event.pointerId);
    } catch {
      // The browser may already have released capture for a cancelled pointer.
    }

    const now = ownerWindow.performance?.now?.() ?? Date.now();
    if (cancelled || reducedMotion || now - lastGestureClock > 110) {
      yawVelocity = 0;
      pitchVelocity = 0;
      if (cancelled) zoomVelocity = 0;
    }

    setPointerMode();
  }

  function onPointerUp(event) {
    finishPointer(event, false);
  }

  function onPointerCancel(event) {
    finishPointer(event, true);
  }

  function onKeyDown(event) {
    if (event.defaultPrevented || isEditableTarget(event.target)) return;

    const step = getScaleStep(scale);
    let handled = true;

    if (event.shiftKey && event.key === 'ArrowUp') {
      pitch = clamp(pitch - keyboardPitchStep, minPitch, maxPitch);
    } else if (event.shiftKey && event.key === 'ArrowDown') {
      pitch = clamp(pitch + keyboardPitchStep, minPitch, maxPitch);
    } else {
      switch (event.key) {
        case 'ArrowUp':
          setTargetScale(targetScale - step * 0.72, reducedMotion);
          break;
        case 'ArrowDown':
          setTargetScale(targetScale + step * 0.72, reducedMotion);
          break;
        case 'PageUp':
          setTargetScale(targetScale - step * 2.15, reducedMotion);
          break;
        case 'PageDown':
          setTargetScale(targetScale + step * 2.15, reducedMotion);
          break;
        case 'ArrowLeft':
          yaw = wrapAngle(yaw + keyboardOrbitStep);
          break;
        case 'ArrowRight':
          yaw = wrapAngle(yaw - keyboardOrbitStep);
          break;
        case 'Home':
          setTargetScale(homeScale, reducedMotion);
          zoomVelocity = 0;
          break;
        case 'End':
          setTargetScale(maxScale, reducedMotion);
          zoomVelocity = 0;
          break;
        default:
          handled = false;
      }
    }

    if (!handled) return;
    event.preventDefault();
    notifyInteract('keyboard', event);
  }

  function writeSnapshot(out = {}) {
    out.scale = scale;
    out.targetScale = targetScale;
    out.zoomVelocity = zoomVelocity;
    out.yaw = yaw;
    out.pitch = pitch;
    out.yawVelocity = yawVelocity;
    out.pitchVelocity = pitchVelocity;
    out.isDragging = isDragging;
    out.isPinching = isPinching;
    out.interacted = interacted;
    out.reducedMotion = reducedMotion;
    return out;
  }

  function update(deltaSeconds, out = frameState) {
    if (destroyed) return writeSnapshot(out);
    const delta = clamp(Number(deltaSeconds) || 0, 0, maxFrameDelta);

    if (reducedMotion) {
      settleForReducedMotion();
      return writeSnapshot(out);
    }

    if (Math.abs(zoomVelocity) > 0.001) {
      const unclampedTarget = targetScale + zoomVelocity * delta;
      targetScale = clamp(unclampedTarget, minScale, maxScale);
      if (targetScale !== unclampedTarget) zoomVelocity = 0;
      else zoomVelocity *= Math.exp(-zoomDamping * delta);

      const localStep = getScaleStep(scale);
      const speedRatio = clamp(Math.abs(zoomVelocity) / Math.max(localStep * zoomDamping * 2.2, 1), 0, 1);
      const maxLead = localStep * lerp(1.4, targetLeadFactor, speedRatio);
      const lead = targetScale - scale;
      if (Math.abs(lead) > maxLead) {
        targetScale = scale + Math.sign(lead) * maxLead;
        zoomVelocity *= 0.78;
      }
    } else {
      zoomVelocity = 0;
    }

    wheelResidue *= Math.exp(-12 * delta);
    if (Math.abs(wheelResidue) < 0.001) wheelResidue = 0;

    const responseSpeed = clamp(
      Math.abs(zoomVelocity) / Math.max(getScaleStep(scale) * zoomDamping * 1.8, 1),
      0,
      1
    );
    scale = damp(scale, targetScale, zoomResponse * lerp(0.84, 1.1, responseSpeed), delta);
    if (Math.abs(scale - targetScale) < 0.001) scale = targetScale;

    if (pointers.size === 0) {
      yaw = wrapAngle(yaw + yawVelocity * delta);
      pitch = clamp(pitch + pitchVelocity * delta, minPitch, maxPitch);
      yawVelocity *= Math.exp(-orbitDamping * delta);
      pitchVelocity *= Math.exp(-orbitDamping * delta);
      if (pitch === minPitch || pitch === maxPitch) pitchVelocity = 0;
      if (Math.abs(yawVelocity) < 0.0001) yawVelocity = 0;
      if (Math.abs(pitchVelocity) < 0.0001) pitchVelocity = 0;
    } else {
      const now = ownerWindow.performance?.now?.() ?? Date.now();
      if (now - lastGestureClock > 110) {
        yawVelocity = 0;
        pitchVelocity = 0;
      }
    }

    return writeSnapshot(out);
  }

  function setScale(nextValue, config = {}) {
    const immediate = config.immediate ?? true;
    setTargetScale(nextValue, immediate || reducedMotion);
    if (config.clearVelocity ?? true) {
      zoomVelocity = 0;
      wheelResidue = 0;
      lastWheelClock = 0;
      lastWheelDirection = 0;
    }
    return writeSnapshot(frameState);
  }

  function setOrbit(nextYaw, nextPitch, config = {}) {
    if (Number.isFinite(nextYaw)) yaw = wrapAngle(nextYaw);
    if (Number.isFinite(nextPitch)) pitch = clamp(nextPitch, minPitch, maxPitch);
    if (config.clearVelocity ?? true) {
      yawVelocity = 0;
      pitchVelocity = 0;
    }
    return writeSnapshot(frameState);
  }

  function destroy() {
    if (destroyed) return;
    destroyed = true;
    wheelTarget.removeEventListener('wheel', onWheel);
    element.removeEventListener('pointerdown', onPointerDown);
    element.removeEventListener('pointermove', onPointerMove);
    element.removeEventListener('pointerup', onPointerUp);
    element.removeEventListener('pointercancel', onPointerCancel);
    keyTarget.removeEventListener('keydown', onKeyDown);
    if (motionQuery?.removeEventListener) motionQuery.removeEventListener('change', onMotionPreferenceChange);
    else motionQuery?.removeListener?.(onMotionPreferenceChange);
    pointers.clear();
    isDragging = false;
    isPinching = false;
    if (element.style) element.style.touchAction = previousTouchAction;
    notifyDragChange();
  }

  wheelTarget.addEventListener('wheel', onWheel, { passive: false });
  element.addEventListener('pointerdown', onPointerDown, { passive: false });
  element.addEventListener('pointermove', onPointerMove, { passive: false });
  element.addEventListener('pointerup', onPointerUp, { passive: false });
  element.addEventListener('pointercancel', onPointerCancel, { passive: false });
  keyTarget.addEventListener('keydown', onKeyDown);
  if (motionQuery?.addEventListener) motionQuery.addEventListener('change', onMotionPreferenceChange);
  else motionQuery?.addListener?.(onMotionPreferenceChange);

  return {
    update,
    snapshot: writeSnapshot,
    setScale,
    setOrbit,
    setReducedMotion,
    getScaleStep,
    destroy
  };
}
