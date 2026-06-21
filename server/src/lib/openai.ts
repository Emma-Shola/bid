import { generateDeterministicResumeContent } from "./resume/pipeline";

export async function generateResumeContent(input: {
  jobTitle: string;
  company: string;
  jobDescription: string;
  resumeText?: string;
  candidateName?: string;
}) {
  return generateDeterministicResumeContent(input);
}
