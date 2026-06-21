export const RESUME_RENDER_SECTION_ORDER = [
  "summary",
  "experience",
  "education",
  "certificates",
  "skills"
] as const;

export const RESUME_RENDER_SEPARATORS = {
  entry: " | "
} as const;

export const RESUME_RENDER_TOKENS = {
  typography: {
    nameSize: 24.8,
    titleSize: 10.8,
    sectionHeadingSize: 9.55,
    bodySize: 9.05,
    subtextSize: 7.95,
    lineHeight: 1.09,
    bulletIndent: 8.25,
    sectionSpacing: 3.1,
    itemSpacing: 1.05
  },
  composition: {
    pagePadding: 18,
    headerGap: 3,
    sectionGap: 3.5,
    sectionBodyGap: 1.25,
    entryGap: 2.35,
    rowGap: 0.75,
    bulletGap: 0.45,
    bulletIndent: 8.25,
    labelWidth: 98,
    metaWidth: 82,
    rightColumnGap: 7.5
  },
  layout: {
    pageWidth: 595.28,
    pageHeight: 841.89,
    margin: 18,
    paragraphGap: 1.75
  },
  colors: {
    ink: "#0f172a",
    body: "#111827",
    muted: "#475569",
    faint: "#64748b",
    accent: "#1e3a8a",
    rule: "#dbe4ef",
    page: "#ffffff"
  },
  fonts: {
    serif: "Times-Roman",
    serifBold: "Times-Bold",
    sans: "Helvetica",
    sansBold: "Helvetica-Bold",
    previewSans: "'Segoe UI', Helvetica, Arial, sans-serif",
    previewSerif: "Georgia, Cambria, 'Times New Roman', serif"
  }
} as const;

export type ResumeRenderSectionKey = (typeof RESUME_RENDER_SECTION_ORDER)[number];
