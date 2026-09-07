export const DOCUMENT_QA_PATTERN_KINDS = [
  "grounded-answer",
  "insufficient-evidence",
  "conflicting-evidence",
  "citation-required",
  "static-vs-live",
  "code-navigation",
  "clarification",
  "prompt-injection-resistance",
] as const;

export const PATTERN_LANGUAGES = ["en", "ja", "ko"] as const;
