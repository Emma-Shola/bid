import { generateDeterministicResumeContent } from "./resume/pipeline";

export async function generateResumeContent(input: {
  jobTitle: string;
  company: string;
  jobDescription: string;
  candidateName?: string;
  candidateProfile: unknown;
  resumeRulesText?: string;
}) {
  return generateDeterministicResumeContent(input);
}
