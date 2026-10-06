const RUNTIME_SIGNALS = [
  {
    name: "run website",
    pattern: /\brun\s+(?:the\s+)?website\b/i,
  },
  {
    name: "start app",
    pattern: /\bstart\s+(?:the\s+)?app\b/i,
  },
  {
    name: "serve app",
    pattern: /\bserve\s+(?:the\s+)?app\b/i,
  },
  {
    name: "restart app",
    pattern: /\brestart\s+(?:the\s+)?app\b/i,
  },
  {
    name: "check logs",
    pattern: /\bcheck\s+(?:the\s+)?logs\b/i,
  },
  {
    name: "port issue",
    pattern: /\bport\s+issues?\b/i,
  },
];

const FRONTEND_SIGNALS = [
  {
    name: "frontend",
    pattern: /\bfront[\s-]?end\b/i,
  },
  {
    name: "ui",
    pattern: /\bui\b/i,
  },
  {
    name: "ux",
    pattern: /\bux\b/i,
  },
  {
    name: "component",
    pattern: /\b(?:component|components|komponen)\b/i,
  },
  {
    name: "page",
    pattern: /\b(?:page|pages|halaman)\b/i,
  },
  {
    name: "navbar",
    pattern: /\b(?:navbar|nav\s*bar|navigation\s+bar|navigasi)\b/i,
  },
  {
    name: "styling",
    pattern: /\b(?:css|tailwind|style|styling|layout|responsive|visual|accessibility)\b/i,
  },
];

const BACKEND_SIGNALS = [
  {
    name: "backend",
    pattern: /\bback[\s-]?end\b/i,
  },
  {
    name: "api",
    pattern: /\bapi\b/i,
  },
  {
    name: "endpoint",
    pattern: /\b(?:endpoint|route\s+handler)\b/i,
  },
  {
    name: "database",
    pattern: /\b(?:database|db|basis\s+data)\b/i,
  },
  {
    name: "prisma",
    pattern: /\bprisma\b/i,
  },
  {
    name: "schema",
    pattern: /\b(?:schema|migration|migrate)\b/i,
  },
  {
    name: "server",
    pattern: /\b(?:server|service|data|ledger)\b/i,
  },
  {
    name: "auth",
    pattern: /\bauth(?:entication|orization)?\b/i,
  },
];

function matchingSignals(text, definitions) {
  return definitions
    .filter(({ pattern }) => pattern.test(text))
    .map(({ name }) => name);
}

function inspectionResult(reason, signals) {
  return {
    kind: "inspection_first",
    reason,
    signals,
    dispatch: {
      allowed: false,
    },
    nextStep: "inspect",
  };
}

function routeTaskIntent(instruction) {
  const text = typeof instruction === "string"
    ? instruction
    : "";
  const runtimeSignals = matchingSignals(text, RUNTIME_SIGNALS);

  if (runtimeSignals.length > 0) {
    return {
        kind: "supervisor_runtime",
      reason: "explicit_runtime_phrase",
      signals: runtimeSignals,
      dispatch: {
        allowed: false,
      },
      nextStep: "handle_runtime",
    };
  }

  const frontendSignals = matchingSignals(text, FRONTEND_SIGNALS);
  const backendSignals = matchingSignals(text, BACKEND_SIGNALS);
  const signals = [
    ...frontendSignals,
    ...backendSignals,
  ];

  if (frontendSignals.length === 0 && backendSignals.length === 0) {
    return inspectionResult("ambiguous_intent", signals);
  }

  if (frontendSignals.length >= 2 && backendSignals.length >= 2) {
    return inspectionResult("strong_mixed_signals", signals);
  }

  if (frontendSignals.length === backendSignals.length) {
    return inspectionResult("tied_signals", signals);
  }

  if (frontendSignals.length > backendSignals.length) {
    return {
      kind: "frontend",
      reason: "frontend_signals",
      signals,
      dispatch: {
        allowed: true,
        division: "frontend",
      },
    };
  }

  return {
    kind: "backend",
    reason: "backend_signals",
    signals,
    dispatch: {
      allowed: true,
      division: "backend",
    },
  };
}

module.exports = {
  routeTaskIntent,
};
