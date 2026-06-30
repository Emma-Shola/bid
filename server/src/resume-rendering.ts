export const RESUME_RENDER_SECTION_ORDER = [
  "summary",
  "experience",
  "skills",
  "certificates",
  "education"
] as const;

export const RESUME_RENDER_SEPARATORS = {
  entry: " | "
} as const;

export const RESUME_RENDER_TOKENS = {
  spacing: {
    xs:  2,
    sm:  4,
    md:  8,
    lg: 12,
  },
  typography: {
    nameSize:            24,
    titleSize:           10,
    sectionHeadingSize:   9,
    bodySize:            9.5,
    subtextSize:         8.5,
    roleSize:            10,
    lineHeight:          1.25,
    bulletIndent:        14,
    sectionSpacing:      12,
    itemSpacing:          8,
  },
  composition: {
    pagePadding:     36,
    headerGap:        8,
    sectionGap:       4,
    sectionBodyGap:   4,
    entryGap:         8,
    rowGap:           0,
    bulletGap:        2,
    bulletIndent:    14,
    labelWidth:      115,
    metaWidth:        90,
    rightColumnGap:   8,
  },
  layout: {
    pageWidth:   595.28,
    pageHeight:  841.89,
    margin:           36,
    paragraphGap:      2,
  },
  colors: {
    ink:    "#1a1a1a",
    body:   "#1a1a1a",
    muted:  "#444444",
    faint:  "#666666",
    accent: "#7D1A1A",
    rule:   "#c8c8c8",
    page:   "#ffffff",
  },
  fonts: {
    serif:           "Times-Roman",
    serifBold:       "Times-Bold",
    serifItalic:     "Times-Italic",
    serifBoldItalic: "Times-BoldItalic",
    sans:            "Helvetica",
    sansBold:        "Helvetica-Bold",
    sansItalic:      "Helvetica-Oblique",
    sansBoldItalic:  "Helvetica-BoldOblique",
    previewSans:  "'Segoe UI', Helvetica, Arial, sans-serif",
    previewSerif: "Georgia, Cambria, 'Times New Roman', serif",
  },
} as const;

export type ResumeRenderSectionKey = (typeof RESUME_RENDER_SECTION_ORDER)[number];
