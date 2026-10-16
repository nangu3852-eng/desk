const DAY = 86400000;

function localDay(now) {
  const date = new Date(now);
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function canProactivelyChat({ now = Date.now(), lastActivity = 0, lastSent = 0, day = "", count = 0,
  enabled = false, configured = false, busy = false }) {
  const hour = new Date(now).getHours();
  return enabled && configured && !busy && hour >= 9 && hour < 21
    && now - lastActivity >= 20 * 60000 && now - lastActivity < 8 * 60 * 60000
    && now - lastSent >= 2 * 60 * 60000
    && (day !== localDay(now) || count < 2);
}

function nextProactiveState(previous, now = Date.now()) {
  const day = localDay(now);
  return { day, count: previous.day === day ? previous.count + 1 : 1, lastSent: now };
}

module.exports = { canProactivelyChat, nextProactiveState, localDay, DAY };
