export const SOURCE_STATUS = {
  pdfSeed: {
    id: "SRC-PDF-001",
    status: "[PDF]",
    use: "FSP dramaturgy / slide structure; not medical authority",
  },
  deepSearch: {
    id: "SRC-DS-001",
    status: "[VERIFIED]",
    use: "Medical/FSP corrections and source traceability",
  },
  prototypeCase: {
    id: "SRC-CASE-001",
    status: "[PROTOTYPE]",
    use: "Canonical reconciled SLE case v1 (Leonie Hartmann)",
  },
  zagMuenster: {
    id: "SRC-NRW-001",
    status: "[REVIEW]",
    use: "NRW approbation pathway wording",
  },
  aekno: {
    id: "SRC-AEKNO-001",
    status: "[VERIFIED]",
    use: "Düsseldorf/ÄKNo exam context (public description only)",
  },
  aeknoExamFlow: {
    id: "SRC-AEKNO-002",
    status: "[VERIFIED]",
    use: "Three-station exam phases and timing",
  },
  sleGuideline: {
    id: "SRC-SLE-GUIDELINE-001",
    status: "[VERIFIED]",
    use: "German S3 SLE management principles (DeepSearch S3)",
  },
  sleClassification: {
    id: "SRC-SLE-CLASS-001",
    status: "[VERIFIED]",
    use: "2019 EULAR/ACR classification rules",
  },
} as const;

export const PROVENANCE_LABELS = [
  "[PDF]",
  "[VERIFIED]",
  "[PROTOTYPE]",
  "[INFERENCE]",
  "[REVIEW]",
  "[PDF-CONFLICT]",
] as const;
