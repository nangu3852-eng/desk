const SLEEP_AFTER_MS = 5 * 60 * 1000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

// Electron display coordinates are DIP coordinates including negative origins.
// Only connected horizontal work areas with room for the window are joined.
function walkingArea(bounds, displays, crossDisplays = true) {
  const areas = displays.map((display) => display.workArea).filter((area) =>
    area && area.width >= bounds.width && area.height >= bounds.height);
  if (!areas.length) return null;
  const center = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const distance = (area) => Math.hypot(
    center.x - clamp(center.x, area.x, area.x + area.width),
    center.y - clamp(center.y, area.y, area.y + area.height),
  );
  const origin = [...areas].sort((a, b) => distance(a) - distance(b))[0];
  let left = origin.x;
  let right = origin.x + origin.width;
  let top = origin.y;
  let bottom = origin.y + origin.height;
  const joined = new Set([origin]);
  if (crossDisplays) {
    let changed = true;
    while (changed) {
      changed = false;
      for (const area of areas) {
        if (joined.has(area)) continue;
        const nextTop = Math.max(top, area.y);
        const nextBottom = Math.min(bottom, area.y + area.height);
        const adjacent = Math.abs(area.x + area.width - left) <= 2
          || Math.abs(area.x - right) <= 2;
        if (!adjacent || nextBottom - nextTop < bounds.height) continue;
        joined.add(area);
        left = Math.min(left, area.x);
        right = Math.max(right, area.x + area.width);
        top = nextTop;
        bottom = nextBottom;
        changed = true;
      }
    }
  }
  return { minX: left, maxX: right - bounds.width, minY: top, maxY: bottom - bounds.height };
}

class PetBehavior {
  constructor(now = Date.now(), random = Math.random) {
    this.random = random;
    this.mode = "idle";
    this.direction = -1;
    this.lastInteraction = now;
    this.nextWalk = now + this.walkDelay();
    this.lastTick = now;
    this.walkUntil = 0;
    this.x = null;
  }

  walkDelay() { return 8000 + this.random() * 10000; }

  stop(now) {
    if (this.mode === "sleep") return;
    this.mode = "idle";
    this.x = null;
    this.nextWalk = now + this.walkDelay();
  }

  interact(now = Date.now()) {
    this.mode = "idle";
    this.lastInteraction = now;
    this.x = null;
    this.nextWalk = now + this.walkDelay();
  }

  sleep() { this.mode = "sleep"; this.x = null; }

  tick({ now = Date.now(), bounds, displays, settings, blocked = false, canSleep = true }) {
    // Limit elapsed time after resume from system sleep to avoid teleportation.
    const elapsed = clamp(now - this.lastTick, 0, 100);
    this.lastTick = now;
    if (this.mode === "sleep" && !canSleep) this.interact(now);
    if (!blocked && canSleep && settings.autoSleep !== false
      && now - this.lastInteraction >= SLEEP_AFTER_MS) this.sleep();
    if (this.mode === "sleep") return this.snapshot();
    if (blocked || settings.autoWalk === false || settings.expressionMode === "clickOnly") {
      if (this.mode === "walking") this.stop(now);
      return this.snapshot();
    }
    if (this.mode === "idle" && now >= this.nextWalk) {
      this.mode = "walking";
      this.direction = this.random() < 0.5 ? -1 : 1;
      this.walkUntil = now + 12000 + this.random() * 14000;
      this.x = bounds.x;
    }
    if (this.mode !== "walking") return this.snapshot();
    if (now >= this.walkUntil) { this.stop(now); return this.snapshot(); }
    const area = walkingArea(bounds, displays, settings.crossDisplays !== false);
    if (!area) { this.stop(now); return this.snapshot(); }
    const scale = Number(settings.scale) || 1;
    this.x = clamp(this.x ?? bounds.x, area.minX, area.maxX);
    const nextX = this.x + this.direction * 82 * scale * elapsed / 1000;
    if (nextX <= area.minX || nextX >= area.maxX) this.direction *= -1;
    this.x = clamp(nextX, area.minX, area.maxX);
    return { ...this.snapshot(), position: { x: Math.round(this.x), y: clamp(bounds.y, area.minY, area.maxY) } };
  }

  snapshot() { return { mode: this.mode, direction: this.direction }; }
}

module.exports = { PetBehavior, walkingArea, SLEEP_AFTER_MS };
