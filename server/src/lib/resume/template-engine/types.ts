export type ResumeSectionKey = "summary" | "skills" | "experience" | "education" | "certificates";

export type ResumeTemplateTypography = {
  nameSize: number;
  titleSize: number;
  sectionHeadingSize: number;
  bodySize: number;
  subtextSize: number;
  lineHeight: number;
  bulletIndent: number;
  sectionSpacing: number;
  itemSpacing: number;
};

export type ResumeTemplateComposition = {
  pagePadding: number;
  headerGap: number;
  sectionGap: number;
  sectionBodyGap: number;
  entryGap: number;
  rowGap: number;
  bulletGap: number;
  bulletIndent: number;
  labelWidth: number;
  metaWidth: number;
  rightColumnGap: number;
};

export type ResumeTemplateLayout = {
  pageWidth: number;
  pageHeight: number;
  margin: number;
  paragraphGap: number;
};

export type ResumeTemplateDefinition = {
  id: string;
  name: string;
  sectionOrder: ResumeSectionKey[];
  separators: {
    entry: string;
  };
  typography: ResumeTemplateTypography;
  composition: ResumeTemplateComposition;
  layout: ResumeTemplateLayout;
};
