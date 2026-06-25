export const SOURCE_STATUS = {
  pdfSeed: {
    id: "SRC-PDF-001",
    status: "UNVERIFIED_FROM_PDF",
    use: "Case structure and provisional fictional facts only",
  },
  zagMuenster: {
    id: "SRC-NRW-001",
    status: "RECHECK_REQUIRED",
    use: "NRW approbation pathway wording",
  },
  aekno: {
    id: "SRC-AEKNO-001",
    status: "RECHECK_REQUIRED",
    use: "Düsseldorf/Ärztekammer Nordrhein exam context",
  },
  aeknoExamFlow: {
    id: "SRC-AEKNO-002",
    status: "RECHECK_REQUIRED",
    use: "Exam phases and timing",
  },
  sleGuideline: {
    id: "SRC-SLE-GUIDELINE-001",
    status: "PENDING_DEEPSEARCH",
    use: "Canonical medical facts after review",
  },
  sleEdu: {
    id: "SRC-SLE-EDU-001",
    status: "PENDING_DEEPSEARCH",
    use: "Patient-friendly explanations",
  },
} as const;
