/**
 * Stage 1C — reconcile Chromium profile singleton locks before spawn.
 * Removes only stale SingletonLock / SingletonCookie / SingletonSocket symlinks.
 * Never deletes cookies, session storage, or other profile data.
 */

const os = require("os");
const fs = require("fs");
const path = require("path");

const SINGLETON_FILES = ["SingletonLock", "SingletonCookie", "SingletonSocket"];

/**
 * Presence via lstat only — never follow symlink targets.
 * Chromium Singleton* entries are often intentional dangling symlinks
 * (SingletonLock -> hostname-pid). Node existsSync()/stat() would miss them.
 */
function pathEntryExistsLstat(entryPath, fsMod = fs) {
  try {
    fsMod.lstatSync(entryPath);
    return true;
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return false;
    }
    // Conservative: treat unexpected errors as present so we do not
    // silently skip inspection/removal of locks we cannot probe.
    return true;
  }
}

function normalizeProfilePath(profileDir) {
  if (!profileDir) return "";
  try {
    return fs.realpathSync.native
      ? fs.realpathSync.native(profileDir)
      : fs.realpathSync(profileDir);
  } catch {
    return path.resolve(profileDir);
  }
}

function parseSingletonLockTarget(target) {
  const raw = String(target || "").trim();
  if (!raw) return { ok: false, reason: "empty_lock_target" };
  const sep = raw.lastIndexOf("-");
  if (sep <= 0 || sep >= raw.length - 1) {
    return { ok: false, reason: "malformed_lock_target" };
  }
  const hostname = raw.slice(0, sep);
  const pidText = raw.slice(sep + 1);
  const pid = Number(pidText);
  if (!hostname || !Number.isInteger(pid) || pid <= 0) {
    return { ok: false, reason: "malformed_lock_target" };
  }
  return { ok: true, hostname, pid };
}

function defaultReadProcessInfo(pid, fsMod = fs) {
  const procStat = `/proc/${pid}/stat`;
  const procCmd = `/proc/${pid}/cmdline`;
  try {
    const statRaw = fsMod.readFileSync(procStat, "utf8");
    const close = statRaw.indexOf(")");
    if (close < 0) return { exists: false };
    const rest = statRaw.slice(close + 2);
    const state = rest[0] || "";
    const cmdRaw = fsMod.readFileSync(procCmd);
    const args = String(cmdRaw)
      .split("\0")
      .filter(Boolean);
    return { exists: true, state, args };
  } catch {
    return { exists: false };
  }
}

function cmdlineUsesProfile(args, userDataDir) {
  if (!Array.isArray(args) || !userDataDir) return false;
  const normalized = normalizeProfilePath(userDataDir);
  for (const arg of args) {
    if (!arg.startsWith("--user-data-dir=")) continue;
    const value = arg.slice("--user-data-dir=".length);
    const resolved = normalizeProfilePath(value);
    if (resolved === normalized) return true;
  }
  return false;
}

function isChromiumProcess(args) {
  if (!Array.isArray(args) || !args.length) return false;
  const exe = path.basename(String(args[0] || ""));
  return /^(chrome|chromium|google-chrome|google-chrome-stable|chromium-browser)$/i.test(exe)
    || /chrom(e|ium)/i.test(exe);
}

function isLiveChromiumProfileOwner(pid, userDataDir, deps = {}) {
  const readProcessInfo = deps.readProcessInfo || ((p) => defaultReadProcessInfo(p, deps.fs || fs));
  const info = readProcessInfo(pid);
  if (!info.exists) return { live: false, reason: "pid_not_found" };
  if (info.state === "Z") return { live: false, reason: "pid_is_zombie" };
  if (!isChromiumProcess(info.args)) return { live: false, reason: "pid_not_chromium" };
  if (!cmdlineUsesProfile(info.args, userDataDir)) {
    return { live: false, reason: "pid_chromium_other_profile" };
  }
  return { live: true, reason: "live_chromium_owner" };
}

function listSingletonPresence(userDataDir, fsMod = fs) {
  const present = [];
  for (const name of SINGLETON_FILES) {
    const full = path.join(userDataDir, name);
    if (pathEntryExistsLstat(full, fsMod)) present.push(name);
  }
  return present;
}

function readSingletonLockTarget(userDataDir, fsMod = fs) {
  const lockPath = path.join(userDataDir, "SingletonLock");
  let lstat;
  try {
    lstat = fsMod.lstatSync(lockPath);
  } catch (err) {
    if (err && (err.code === "ENOENT" || err.code === "ENOTDIR")) {
      return { exists: false, target: null };
    }
    return {
      exists: true,
      target: null,
      malformed: true,
      reason: err instanceof Error ? err.message : "lock_lstat_failed",
    };
  }
  try {
    if (!lstat.isSymbolicLink()) {
      return { exists: true, target: null, malformed: true, reason: "lock_not_symlink" };
    }
    const target = fsMod.readlinkSync(lockPath);
    return { exists: true, target };
  } catch (err) {
    return {
      exists: true,
      target: null,
      malformed: true,
      reason: err instanceof Error ? err.message : "lock_read_failed",
    };
  }
}

function findLiveProfileOwnersViaScan(userDataDir, deps = {}) {
  const fsMod = deps.fs || fs;
  const readProcessInfo = deps.readProcessInfo || ((p) => defaultReadProcessInfo(p, deps.fs || fs));
  const listPids = deps.listPids;
  let pids = [];
  if (typeof listPids === "function") {
    pids = listPids();
  } else {
    try {
      pids = fsMod
        .readdirSync("/proc")
        .map((name) => Number(name))
        .filter((n) => Number.isInteger(n) && n > 0);
    } catch {
      pids = [];
    }
  }
  const owners = [];
  for (const pid of pids) {
    const owner = isLiveChromiumProfileOwner(pid, userDataDir, { readProcessInfo, fs: fsMod });
    if (owner.live) owners.push(pid);
  }
  return owners;
}

function inspectProfileLockState(userDataDir, deps = {}) {
  const fsMod = deps.fs || fs;
  const hostname = deps.hostname || os.hostname();
  const present = listSingletonPresence(userDataDir, fsMod);
  if (!present.length) {
    return {
      stale_lock_detected: false,
      should_remove: false,
      reason: "no_lock_files",
      present,
    };
  }

  const lock = readSingletonLockTarget(userDataDir, fsMod);
  if (!lock.exists) {
    const owners = findLiveProfileOwnersViaScan(userDataDir, deps);
    if (owners.length) {
      return {
        stale_lock_detected: true,
        should_remove: false,
        reason: "live_chromium_owner_without_lock",
        present,
        owners,
      };
    }
    return {
      stale_lock_detected: true,
      should_remove: true,
      reason: "orphan_singleton_files_no_lock",
      present,
    };
  }

  if (lock.malformed) {
    const owners = findLiveProfileOwnersViaScan(userDataDir, deps);
    if (owners.length) {
      return {
        stale_lock_detected: true,
        should_remove: false,
        reason: "malformed_lock_live_owner_found",
        present,
        owners,
      };
    }
    return {
      stale_lock_detected: true,
      should_remove: true,
      reason: "malformed_lock_no_live_owner",
      present,
    };
  }

  const parsed = parseSingletonLockTarget(lock.target);
  if (!parsed.ok) {
    const owners = findLiveProfileOwnersViaScan(userDataDir, deps);
    if (owners.length) {
      return {
        stale_lock_detected: true,
        should_remove: false,
        reason: "malformed_lock_live_owner_found",
        present,
        owners,
      };
    }
    return {
      stale_lock_detected: true,
      should_remove: true,
      reason: "malformed_lock_no_live_owner",
      present,
    };
  }

  if (parsed.hostname !== hostname) {
    const owners = findLiveProfileOwnersViaScan(userDataDir, deps);
    if (owners.length) {
      return {
        stale_lock_detected: true,
        should_remove: false,
        reason: "live_profile_owner_found_during_stale_check",
        present,
        lock_hostname: parsed.hostname,
        lock_pid: parsed.pid,
        owners,
      };
    }
    return {
      stale_lock_detected: true,
      should_remove: true,
      reason: "previous_container_hostname",
      present,
      lock_hostname: parsed.hostname,
      lock_pid: parsed.pid,
    };
  }

  const owner = isLiveChromiumProfileOwner(parsed.pid, userDataDir, deps);
  if (owner.live) {
    return {
      stale_lock_detected: true,
      should_remove: false,
      reason: "live_chromium_owner",
      present,
      lock_hostname: parsed.hostname,
      lock_pid: parsed.pid,
    };
  }

  return {
    stale_lock_detected: true,
    should_remove: true,
    reason: owner.reason || "no_live_chromium_owner",
    present,
    lock_hostname: parsed.hostname,
    lock_pid: parsed.pid,
  };
}

function removeSingletonFiles(userDataDir, fsMod = fs) {
  const removed = [];
  for (const name of SINGLETON_FILES) {
    const full = path.join(userDataDir, name);
    try {
      // lstat-based: dangling Chromium Singleton symlinks must still unlink.
      if (!pathEntryExistsLstat(full, fsMod)) continue;
      fsMod.unlinkSync(full);
      removed.push(name);
    } catch {
      /* leave file in place */
    }
  }
  return removed;
}

function logLockDecision(log, result) {
  const parts = [
    `stale_lock_detected=${result.stale_lock_detected ? "true" : "false"}`,
    `stale_lock_removed=${result.stale_lock_removed ? "true" : "false"}`,
    `reason=${result.reason || "unknown"}`,
  ];
  log(`[browser:profile-lock] ${parts.join(" ")}`);
}

function reconcileProfileLocks(userDataDir, deps = {}) {
  const fsMod = deps.fs || fs;
  const log = deps.log || (() => {});
  const inspection = inspectProfileLockState(userDataDir, deps);
  if (!inspection.should_remove) {
    const out = {
      ...inspection,
      stale_lock_removed: false,
      removed: [],
    };
    logLockDecision(log, out);
    return out;
  }

  const owners = findLiveProfileOwnersViaScan(userDataDir, deps);
  if (owners.length) {
    const out = {
      ...inspection,
      stale_lock_detected: true,
      should_remove: false,
      stale_lock_removed: false,
      reason: "live_profile_owner_found_before_delete",
      removed: [],
      owners,
    };
    logLockDecision(log, out);
    return out;
  }

  const removed = removeSingletonFiles(userDataDir, fsMod);
  const out = {
    ...inspection,
    stale_lock_removed: removed.length > 0,
    removed,
    reason: removed.length ? inspection.reason : `${inspection.reason}_remove_failed`,
  };
  logLockDecision(log, out);
  return out;
}

module.exports = {
  SINGLETON_FILES,
  pathEntryExistsLstat,
  normalizeProfilePath,
  parseSingletonLockTarget,
  readSingletonLockTarget,
  listSingletonPresence,
  isLiveChromiumProfileOwner,
  findLiveProfileOwnersViaScan,
  inspectProfileLockState,
  removeSingletonFiles,
  reconcileProfileLocks,
  defaultReadProcessInfo,
  cmdlineUsesProfile,
  isChromiumProcess,
};
