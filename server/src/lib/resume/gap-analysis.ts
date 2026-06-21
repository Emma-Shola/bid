import { dedupeStrings, normalizeKeyword, normalizeWhitespace } from "./shared";
import { extractKnownSkills, skillExistsInText } from "./skill-taxonomy";
import { type JobAnalysis, type ParsedResume, type TailoredResume } from "./types";
import { type ResumeScore } from "./scoring";

export type ResumeGapAnalysis = {
  extracted_jd_skills: string[];
  resume_skills: string[];
  proven_skills: string[];
  adjacent_skills: string[];
  missing_skills: string[];
  injected_skills: string[];
  blocked_missing_skills: string[];
  ats_match_before: number;
  ats_match_after: number;
};

function fullResumeText(source: ParsedResume) {
  return normalizeWhitespace(
    [
      source.name,
      source.title,
      source.summary,
      source.skills.join(" "),
      source.skillCategories.flatMap((category) => [category.category, ...category.skills]).join(" "),
      source.experience
        .flatMap((item) => [item.role, item.company, item.location, item.bullets.join(" ")])
        .join(" "),
      source.education.flatMap((item) => [item.school, item.degree, item.details.join(" ")]).join(" ")
    ].join(" ")
  );
}

function jobSkillTargets(jobAnalysis: JobAnalysis) {
  return dedupeStrings(
    [
      ...jobAnalysis.requiredSkills,
      ...jobAnalysis.preferredSkills,
      ...jobAnalysis.technologies,
      ...jobAnalysis.frameworks,
      ...jobAnalysis.databases,
      ...jobAnalysis.cloudPlatforms,
      ...jobAnalysis.methodologies,
      ...jobAnalysis.tools
    ]
      .map((skill) => normalizeWhitespace(skill))
      .filter(Boolean)
  );
}

function resumeSkillInventory(source: ParsedResume) {
  const text = fullResumeText(source);
  return dedupeStrings(
    [
      ...source.skills,
      ...source.skillCategories.flatMap((category) => category.skills),
      ...extractKnownSkills(text)
    ]
      .map((skill) => normalizeWhitespace(skill))
      .filter(Boolean)
  );
}

function categoryHasEvidence(sourceSkills: string[], targetSkill: string, jobAnalysis: JobAnalysis) {
  const skillKey = normalizeKeyword(targetSkill);
  const sourceKeys = new Set(sourceSkills.map((skill) => normalizeKeyword(skill)));
  const categoryGroups = [
    jobAnalysis.frameworks,
    jobAnalysis.databases,
    jobAnalysis.cloudPlatforms,
    jobAnalysis.methodologies,
    jobAnalysis.tools
  ];

  return categoryGroups.some((group) => {
    const normalizedGroup = group.map((skill) => normalizeKeyword(skill));
    return normalizedGroup.includes(skillKey) && normalizedGroup.some((skill) => sourceKeys.has(skill));
  });
}

export function buildInitialGapAnalysis(input: {
  source: ParsedResume;
  jobAnalysis: JobAnalysis;
  beforeScore: ResumeScore;
}): ResumeGapAnalysis {
  const sourceText = fullResumeText(input.source);
  const extractedJdSkills = jobSkillTargets(input.jobAnalysis);
  const resumeSkills = resumeSkillInventory(input.source);
  const provenSkills = extractedJdSkills.filter(
    (skill) =>
      resumeSkills.some((resumeSkill) => normalizeKeyword(resumeSkill) === normalizeKeyword(skill)) ||
      skillExistsInText(sourceText, skill)
  );
  const unprovenSkills = extractedJdSkills.filter(
    (skill) => !provenSkills.some((provenSkill) => normalizeKeyword(provenSkill) === normalizeKeyword(skill))
  );
  const adjacentSkills = unprovenSkills.filter((skill) => categoryHasEvidence(resumeSkills, skill, input.jobAnalysis));
  const missingSkills = unprovenSkills.filter(
    (skill) => !adjacentSkills.some((adjacentSkill) => normalizeKeyword(adjacentSkill) === normalizeKeyword(skill))
  );

  return {
    extracted_jd_skills: extractedJdSkills,
    resume_skills: resumeSkills,
    proven_skills: provenSkills,
    adjacent_skills: adjacentSkills,
    missing_skills: missingSkills,
    injected_skills: [],
    blocked_missing_skills: missingSkills,
    ats_match_before: input.beforeScore.overall,
    ats_match_after: 0
  };
}

export function finalizeGapAnalysis(input: {
  initial: ResumeGapAnalysis;
  tailored: TailoredResume;
  afterScore: ResumeScore;
}) {
  const finalText = normalizeWhitespace(
    [
      input.tailored.summary,
      input.tailored.tailoredSkills.join(" "),
      input.tailored.tailoredExperience.flatMap((item) => item.bullets).join(" ")
    ].join(" ")
  );

  const sourceSkillKeys = new Set(input.initial.resume_skills.map((skill) => normalizeKeyword(skill)));
  const injectedSkills = input.initial.extracted_jd_skills.filter((skill) => {
    const key = normalizeKeyword(skill);
    return !sourceSkillKeys.has(key) && skillExistsInText(finalText, skill);
  });

  return {
    ...input.initial,
    injected_skills: injectedSkills,
    blocked_missing_skills: input.initial.missing_skills.filter(
      (skill) => !injectedSkills.some((injectedSkill) => normalizeKeyword(injectedSkill) === normalizeKeyword(skill))
    ),
    ats_match_after: input.afterScore.overall
  };
}
