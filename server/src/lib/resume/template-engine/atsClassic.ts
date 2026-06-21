import { RESUME_RENDER_SECTION_ORDER, RESUME_RENDER_SEPARATORS, RESUME_RENDER_TOKENS } from "@/resume-rendering";
import { type ResumeTemplateDefinition } from "./types";

export const ATS_CLASSIC_TEMPLATE: ResumeTemplateDefinition = {
  id: "ats-classic",
  name: "ATS Classic",
  sectionOrder: [...RESUME_RENDER_SECTION_ORDER],
  separators: RESUME_RENDER_SEPARATORS,
  typography: RESUME_RENDER_TOKENS.typography,
  composition: RESUME_RENDER_TOKENS.composition,
  layout: RESUME_RENDER_TOKENS.layout
};


