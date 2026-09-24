import fs from "node:fs"
import path from "node:path"
import os from "node:os"

export const WarroomGuard = async ({ directory }) => {
  const division = process.env.WARROOM_DIVISION
  const stateFile = process.env.WARROOM_STATE

  // OpenCode biasa di luar War Room tidak terpengaruh.
  if (!stateFile || !["frontend", "backend"].includes(division)) {
    return {}
  }

  function loadPolicy() {
    const state = JSON.parse(
      fs.readFileSync(stateFile, "utf8")
    )

    return {
      project: path.resolve(state.project),
      projectId:
        state.project_id ??
        path.basename(
          path.resolve(state.project)
        ),
      writePaths:
        state.ownership?.[division]?.write ?? [],
      denyWrite:
        state.ownership?.[division]?.deny_write ?? [],
      protectedPaths:
        state.protected?.paths ?? [],
      sharedPaths:
        state.shared?.paths ?? [],
      sharedPolicy:
        state.shared?.policy ?? null,
      reservationTtlMs:
        Number(
          state.shared?.reservation_ttl_ms ??
          600000
        ),
    }
  }

  function patternRoot(pattern, project) {
    const cleaned = pattern
      .replace(/\/\*\*$/, "")
      .replace(/\/\*$/, "")

    return path.resolve(project, cleaned)
  }

  function normalizeTarget(target, project) {
    if (!target) return null

    return path.isAbsolute(target)
      ? path.resolve(target)
      : path.resolve(directory || project, target)
  }

  function isInside(target, root) {
    return (
      target === root ||
      target.startsWith(root + path.sep)
    )
  }

  function matchingPattern(
    resolved,
    patterns,
    policy
  ) {
    for (const pattern of patterns) {
      const root =
        patternRoot(
          pattern,
          policy.project
        )

      if (isInside(resolved, root)) {
        return pattern
      }
    }

    return null
  }

  function assertAllowed(target) {
    const policy = loadPolicy()
    const resolved = normalizeTarget(
      target,
      policy.project
    )

    if (!resolved) return

    // Never permit a War Room division to mutate
    // outside its configured project root.
    if (!isInside(resolved, policy.project)) {
      throw new Error(
        `[WARROOM GUARD] ${division} division cannot write outside project root: ${target}`
      )
    }

    // 1. Global protected paths always win.
    const protectedPattern =
      matchingPattern(
        resolved,
        policy.protectedPaths,
        policy
      )

    if (protectedPattern) {
      throw new Error(
        `[WARROOM GUARD] ${division} division cannot write ${target}. ` +
        `Protected War Room path: ${protectedPattern}`
      )
    }

    // 2. Division-specific deny always beats
    // shared or broader write ownership.
    const deniedPattern =
      matchingPattern(
        resolved,
        policy.denyWrite,
        policy
      )

    if (deniedPattern) {
      throw new Error(
        `[WARROOM GUARD] ${division} division cannot write ${target}. ` +
        `Denied by ownership policy: ${deniedPattern}`
      )
    }

    // 3. Shared paths are permitted only through
    // the coordination reservation lifecycle.
    const sharedPattern =
      matchingPattern(
        resolved,
        policy.sharedPaths,
        policy
      )

    if (sharedPattern) {
      return {
        kind: "shared",
        pattern: sharedPattern,
      }
    }

    // 4. Exclusive owned write path.
    const writePattern =
      matchingPattern(
        resolved,
        policy.writePaths,
        policy
      )

    if (writePattern) {
      return {
        kind: "write",
        pattern: writePattern,
      }
    }

    // 5. Default deny.
    throw new Error(
      `[WARROOM GUARD] ${division} division cannot write ${target}. ` +
      `Path is not in this division's write ownership or shared policy.`
    )
  }

  function coordinationFile(policy) {
    return path.join(
      os.homedir(),
      ".warroom",
      "runtime",
      `${policy.projectId}-shared.json`
    )
  }

  function loadCoordination(policy) {
    const file = coordinationFile(policy)

    if (!fs.existsSync(file)) {
      return { requests: [] }
    }

    return JSON.parse(
      fs.readFileSync(file, "utf8")
    )
  }

  function sharedMatch(target, policy) {
    const resolved =
      normalizeTarget(
        target,
        policy.project
      )

    if (!resolved) return null

    for (const pattern of policy.sharedPaths) {
      const root =
        patternRoot(
          pattern,
          policy.project
        )

      if (isInside(resolved, root)) {
        return {
          pattern,
          relative:
            path
              .relative(
                policy.project,
                resolved
              )
              .split(path.sep)
              .join("/"),
        }
      }
    }

    return null
  }

  function sharedTargets(targets, policy) {
    const result = []
    const seen = new Set()

    for (const target of targets) {
      const shared =
        sharedMatch(target, policy)

      if (
        shared &&
        !seen.has(shared.relative)
      ) {
        seen.add(shared.relative)
        result.push(shared)
      }
    }

    return result
  }

  function otherDivision() {
    return division === "frontend"
      ? "backend"
      : "frontend"
  }

  function saveCoordination(policy, store) {
    const file =
      coordinationFile(policy)

    const temp =
      `${file}.tmp-${process.pid}`

    fs.writeFileSync(
      temp,
      JSON.stringify(store, null, 2) + "\n"
    )

    fs.renameSync(temp, file)
  }

  function withCoordinationLock(policy, fn) {
    const lockFile =
      coordinationFile(policy) + ".lock"

    fs.mkdirSync(
      path.dirname(lockFile),
      { recursive: true }
    )

    let fd

    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        fd = fs.openSync(lockFile, "wx")

        fs.writeFileSync(
          fd,
          JSON.stringify({
            pid: process.pid,
            division,
            createdAt:
              new Date().toISOString(),
          }) + "\n"
        )

        break
      } catch (error) {
        if (error?.code !== "EEXIST") {
          throw error
        }

        let stale = false

        try {
          const stat =
            fs.statSync(lockFile)

          stale =
            Date.now() - stat.mtimeMs >
            30000
        } catch {}

        if (stale && attempt === 0) {
          try {
            fs.unlinkSync(lockFile)
          } catch {}

          continue
        }

        throw new Error(
          "[WARROOM GUARD] coordination store is busy; retry the operation."
        )
      }
    }

    try {
      return fn()
    } finally {
      if (fd !== undefined) {
        try {
          fs.closeSync(fd)
        } catch {}
      }

      try {
        fs.unlinkSync(lockFile)
      } catch {}
    }
  }

  function expireStaleReservations(
    policy,
    store
  ) {
    const nowMs = Date.now()
    const now =
      new Date(nowMs).toISOString()

    let changed = false

    for (const request of store.requests) {
      if (request.status !== "reserved") {
        continue
      }

      const reservedMs =
        Date.parse(request.reservedAt ?? "")

      if (!Number.isFinite(reservedMs)) {
        continue
      }

      if (
        nowMs - reservedMs <=
        policy.reservationTtlMs
      ) {
        continue
      }

      request.status = "expired"
      request.expiredAt = now
      request.expiredReason =
        "stale reservation timeout"

      changed = true
    }

    return changed
  }

  function reserveSharedApprovals(
    targets,
    callID
  ) {
    const policy = loadPolicy()

    if (
      policy.sharedPolicy !==
      "coordinate_before_semantic_change"
    ) {
      return
    }

    const shared =
      sharedTargets(targets, policy)

    if (shared.length === 0) {
      return
    }

    const other =
      otherDivision()

    withCoordinationLock(
      policy,
      () => {
        const store =
          loadCoordination(policy)

        if (
          expireStaleReservations(
            policy,
            store
          )
        ) {
          saveCoordination(
            policy,
            store
          )
        }

        const reservations = []

        // Verify ALL required approvals first.
        for (const target of shared) {
          const request =
            store.requests.find(
              (item) =>
                item.status === "approved" &&
                item.from === division &&
                item.to === other &&
                item.approvedBy === other &&
                item.path === target.relative
            )

          if (!request) {
            throw new Error(
              `[WARROOM GUARD] ${division} division cannot modify shared path ${target.relative} without approved coordination. ` +
              `Shared policy: ${policy.sharedPolicy}`
            )
          }

          reservations.push(request)
        }

        const now =
          new Date().toISOString()

        for (const request of reservations) {
          request.status = "reserved"
          request.reservedAt = now
          request.reservedBy = division
          request.reservedCallID = callID
        }

        saveCoordination(
          policy,
          store
        )
      }
    )
  }

  function consumeSharedApprovals(
    targets,
    callID
  ) {
    const policy = loadPolicy()

    const shared =
      sharedTargets(targets, policy)

    if (shared.length === 0) {
      return
    }

    withCoordinationLock(
      policy,
      () => {
        const store =
          loadCoordination(policy)

        let changed = false
        const now =
          new Date().toISOString()

        for (const target of shared) {
          const request =
            store.requests.find(
              (item) =>
                item.status === "reserved" &&
                item.from === division &&
                item.path === target.relative &&
                item.reservedBy === division &&
                item.reservedCallID === callID
            )

          if (!request) {
            continue
          }

          request.status = "consumed"
          request.consumedAt = now
          request.consumedBy = division

          changed = true
        }

        if (changed) {
          saveCoordination(
            policy,
            store
          )
        }
      }
    )
  }

  function shellTouchesProtected(command = "", workdir = null) {
    const policy = loadPolicy()

    const mutationPatterns = [
      /(?:^|[;&|]\s*|\s)(?:rm|mv|cp|touch|mkdir|rmdir|truncate|install|ln|chmod|chown)\b/,
      /\bsed\s+[^;\n]*\s-i(?:\s|$)/,
      /\bperl\s+[^;\n]*\s-pi(?:\s|$)/,
      /\btee\b/,
      /\bdd\b[^;\n]*\bof=/,
      /(?:^|[^<])>>?/,
    ]

    if (!mutationPatterns.some((re) => re.test(command))) {
      return null
    }

    const cwd = workdir
      ? path.resolve(workdir)
      : path.resolve(directory || policy.project)

    for (const pattern of policy.protectedPaths) {
      const protectedRoot = patternRoot(
        pattern,
        policy.project
      )

      const relative = path.relative(
        policy.project,
        protectedRoot
      )

      const candidates = [
        protectedRoot,
        relative,
        "./" + relative,
      ]

      for (const candidate of candidates) {
        if (
          candidate &&
          command.includes(candidate)
        ) {
          return pattern
        }
      }

      if (isInside(cwd, protectedRoot)) {
        return pattern
      }
    }

    return null
  }

  function shellTouchesDenied(command = "", workdir = null) {
    const policy = loadPolicy()

    const mutationPatterns = [
      /(?:^|[;&|]\s*|\s)(?:rm|mv|cp|touch|mkdir|rmdir|truncate|install|ln|chmod|chown)\b/,
      /\bsed\s+[^;\n]*\s-i(?:\s|$)/,
      /\bperl\s+[^;\n]*\s-pi(?:\s|$)/,
      /\btee\b/,
      /\bdd\b[^;\n]*\bof=/,
      /(?:^|[^<])>>?/,
    ]

    if (!mutationPatterns.some((re) => re.test(command))) {
      return null
    }

    const cwd = workdir
      ? path.resolve(workdir)
      : path.resolve(directory || policy.project)

    for (const pattern of policy.denyWrite) {
      const deniedRoot = patternRoot(
        pattern,
        policy.project
      )

      const relative = path.relative(
        policy.project,
        deniedRoot
      )

      const candidates = [
        deniedRoot,
        relative,
        "./" + relative,
      ]

      for (const candidate of candidates) {
        if (candidate && command.includes(candidate)) {
          return pattern
        }
      }

      if (isInside(cwd, deniedRoot)) {
        return pattern
      }
    }

    return null
  }

  function shellTouchesShared(command = "", workdir = null) {
    const policy = loadPolicy()

    const mutationPatterns = [
      /(?:^|[;&|]\s*|\s)(?:rm|mv|cp|touch|mkdir|rmdir|truncate|install|ln|chmod|chown)\b/,
      /\bsed\s+[^;\n]*\s-i(?:\s|$)/,
      /\bperl\s+[^;\n]*\s-pi(?:\s|$)/,
      /\btee\b/,
      /\bdd\b[^;\n]*\bof=/,
      /(?:^|[^<])>>?/,
    ]

    if (!mutationPatterns.some((re) => re.test(command))) {
      return null
    }

    const cwd = workdir
      ? path.resolve(workdir)
      : path.resolve(directory || policy.project)

    for (const pattern of policy.sharedPaths) {
      const sharedRoot =
        patternRoot(
          pattern,
          policy.project
        )

      const relative =
        path
          .relative(
            policy.project,
            sharedRoot
          )
          .split(path.sep)
          .join("/")

      const candidates = [
        sharedRoot,
        relative,
        "./" + relative,
      ]

      for (const candidate of candidates) {
        if (
          candidate &&
          command.includes(candidate)
        ) {
          return pattern
        }
      }

      if (isInside(cwd, sharedRoot)) {
        return pattern
      }
    }

    return null
  }

  function pathsFromPatch(patchText = "") {
    const paths = []

    const re =
      /^\*\*\* (?:Add File|Update File|Delete File|Move to): (.+)$/gm

    let match

    while ((match = re.exec(patchText))) {
      paths.push(match[1].trim())
    }

    return paths
  }

  return {
    "tool.execute.before": async (input, output) => {
      if (input.tool === "bash") {
        const command =
          output.args?.command ?? ""

        const protectedPath =
          shellTouchesProtected(
            command,
            output.args?.workdir
          )

        if (protectedPath) {
          throw new Error(
            `[WARROOM GUARD] ${division} division cannot mutate protected path ${protectedPath} via bash.`
          )
        }

        const denied =
          shellTouchesDenied(
            command,
            output.args?.workdir
          )

        if (denied) {
          throw new Error(
            `[WARROOM GUARD] ${division} division cannot mutate paths covered by ${denied} via bash.`
          )
        }

        const shared =
          shellTouchesShared(
            command,
            output.args?.workdir
          )

        if (shared) {
          throw new Error(
            `[WARROOM GUARD] shared path ${shared} cannot be mutated via bash. ` +
            `Use an approved coordination request with apply_patch/edit/write.`
          )
        }

        const bashMutationPatterns = [
          /(?:^|[;&|]\s*|\s)(?:rm|mv|cp|touch|mkdir|rmdir|truncate|install|ln|chmod|chown)\b/,
          /\bsed\s+[^;\n]*\s-i(?:\s|$)/,
          /\bperl\s+[^;\n]*\s-pi(?:\s|$)/,
          /\btee\b/,
          /\bdd\b[^;\n]*\bof=/,
          /(?:^|[^<])>>?/,
        ]

        if (
          bashMutationPatterns.some(
            (re) => re.test(command)
          )
        ) {
          throw new Error(
            `[WARROOM GUARD] ${division} division cannot mutate project files via bash. ` +
            `Use edit/write/apply_patch so ownership and coordination policy can be enforced.`
          )
        }
      }
      if (
        input.tool === "edit" ||
        input.tool === "write"
      ) {
        const target =
          output.args?.filePath

        assertAllowed(target)

        reserveSharedApprovals(
          [target],
          input.callID
        )

        return
      }

      if (input.tool === "apply_patch") {
        const patchText =
          output.args?.patchText ?? ""

        const targets =
          pathsFromPatch(patchText)

        for (const target of targets) {
          assertAllowed(target)
        }

        reserveSharedApprovals(
          targets,
          input.callID
        )
      }
    },

    "tool.execute.after": async (input, output) => {
      if (
        input.tool === "edit" ||
        input.tool === "write"
      ) {
        consumeSharedApprovals(
          [input.args?.filePath],
          input.callID
        )
        return
      }

      if (input.tool === "apply_patch") {
        const patchText =
          input.args?.patchText ?? ""

        consumeSharedApprovals(
          pathsFromPatch(patchText),
          input.callID
        )
      }
    },
  }
}
