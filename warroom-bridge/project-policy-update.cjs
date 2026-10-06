const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { validateEnvironment } = require("./env-broker.cjs");

const REQUIRED_PROTECTED_PATHS = [
  ".omo/**",
  ".git/**",
];

function assertPattern(value) {
  if (
    typeof value !== "string" ||
    !value.trim() ||
    value.includes("\0") ||
    path.isAbsolute(value) ||
    /^(?:[A-Za-z]:[\\/]|[\\/]{1,2})/.test(value)
  ) {
    throw new Error("Policy paths must be non-empty relative patterns");
  }

  if (value.replace(/\\/g, "/").split("/").includes("..")) {
    throw new Error("Policy paths must not contain traversal");
  }
}

function assertPatternList(value, label) {
  if (!Array.isArray(value)) {
    throw new Error(`${label} must be an array`);
  }

  for (const pattern of value) {
    assertPattern(pattern);
  }
}

function validatePolicy(policy) {
  if (!policy || typeof policy !== "object" || Array.isArray(policy)) {
    throw new Error("Policy must be an object");
  }

  const { ownership, shared, protected: protectedPolicy } = policy;

  if (!ownership || typeof ownership !== "object") {
    throw new Error("policy.ownership must be an object");
  }

  for (const division of ["frontend", "backend"]) {
    const rules = ownership[division];

    if (!rules || typeof rules !== "object" || Array.isArray(rules)) {
      throw new Error(`policy.ownership.${division} must be an object`);
    }

    for (const field of ["write", "read", "deny_write"]) {
      assertPatternList(rules[field], `policy.ownership.${division}.${field}`);
    }
  }

  if (!shared || typeof shared !== "object" || Array.isArray(shared)) {
    throw new Error("policy.shared must be an object");
  }

  assertPatternList(shared.paths, "policy.shared.paths");

  if (shared.policy !== "coordinate_before_semantic_change") {
    throw new Error("Unsupported shared.policy");
  }

  if (!Number.isInteger(shared.reservation_ttl_ms) || shared.reservation_ttl_ms <= 0) {
    throw new Error("policy.shared.reservation_ttl_ms must be a positive integer");
  }

  if (
    !protectedPolicy ||
    typeof protectedPolicy !== "object" ||
    Array.isArray(protectedPolicy)
  ) {
    throw new Error("policy.protected must be an object");
  }

  assertPatternList(protectedPolicy.paths, "policy.protected.paths");

  for (const required of REQUIRED_PROTECTED_PATHS) {
    if (!protectedPolicy.paths.includes(required)) {
      throw new Error(`Protected policy path must remain: ${required}`);
    }
  }

  validateEnvironment(policy.environment);
}

function policySummary(policy) {
  return {
    ownership: policy.ownership,
    shared: policy.shared,
    protected: policy.protected,
    ...(policy.environment !== undefined && { environment: policy.environment }),
  };
}

function writeJsonAtomic(file, value) {
  const directory = path.dirname(file);
  const temporary = path.join(
    directory,
    `.${path.basename(file)}.${process.pid}.${crypto.randomUUID()}.tmp`
  );
  const body = `${JSON.stringify(value, null, 2)}\n`;
  let descriptor;
  let directoryDescriptor;

  try {
    descriptor = fs.openSync(temporary, "wx", 0o600);
    fs.fchmodSync(descriptor, 0o600);
    fs.writeFileSync(descriptor, body, "utf8");
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporary, file);
    fs.chmodSync(file, 0o600);
    directoryDescriptor = fs.openSync(directory, "r");
    fs.fsyncSync(directoryDescriptor);
    fs.closeSync(directoryDescriptor);
    directoryDescriptor = undefined;
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    if (directoryDescriptor !== undefined) fs.closeSync(directoryDescriptor);
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function updateProjectPolicy({ active, expectedProjectId, policy }) {
  if (!active || typeof active.state_file !== "string") {
    throw new Error("Active project state file is missing");
  }

  if (typeof expectedProjectId !== "string" || !expectedProjectId) {
    throw new Error("expectedProjectId is required");
  }

  validatePolicy(policy);
  const state = JSON.parse(fs.readFileSync(active.state_file, "utf8"));

  if (state.project_id !== expectedProjectId) {
    throw new Error("Active project ID does not match expectedProjectId");
  }

  for (const protectedPath of state.protected?.paths ?? []) {
    if (!policy.protected.paths.includes(protectedPath)) {
      throw new Error(`Existing protected policy path must remain: ${protectedPath}`);
    }
  }

  const oldPolicy = policySummary(state);
  const nextState = {
    ...state,
    ownership: policy.ownership,
    shared: policy.shared,
    protected: policy.protected,
    ...(policy.environment !== undefined && { environment: validateEnvironment(policy.environment) }),
  };

  writeJsonAtomic(active.state_file, nextState);

  return {
    oldPolicy,
    newPolicy: policySummary(nextState),
  };
}

module.exports = {
  updateProjectPolicy,
  validatePolicy,
  writeJsonAtomic,
};
