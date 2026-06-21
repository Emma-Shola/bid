import { dedupeStrings, normalizeKeyword, normalizeWhitespace } from "./shared";

type SkillCategoryKey =
  | "languages"
  | "frameworks"
  | "databases"
  | "cloudPlatforms"
  | "methodologies"
  | "tools";

const SKILL_TAXONOMY: Record<SkillCategoryKey, string[]> = {
  languages: [
    "JavaScript",
    "TypeScript",
    "Python",
    "Java",
    "Go",
    "Golang",
    "C#",
    "C++",
    "SQL",
    "Ruby",
    "PHP",
    "Swift",
    "Kotlin",
    "Scala",
    "Rust"
  ],
  frameworks: [
    "React",
    "Next.js",
    "Angular",
    "Vue",
    "Svelte",
    "Node.js",
    "Express",
    "NestJS",
    "FastAPI",
    "Django",
    "Flask",
    "Spring Boot",
    ".NET",
    "ASP.NET",
    "Rails",
    "GraphQL",
    "REST",
    "gRPC",
    "Tailwind CSS"
  ],
  databases: [
    "PostgreSQL",
    "MySQL",
    "MongoDB",
    "Redis",
    "DynamoDB",
    "Elasticsearch",
    "OpenSearch",
    "Snowflake",
    "BigQuery",
    "Redshift",
    "SQL Server",
    "Oracle"
  ],
  cloudPlatforms: [
    "AWS",
    "Azure",
    "GCP",
    "Google Cloud",
    "Docker",
    "Kubernetes",
    "Terraform",
    "Helm",
    "ECS",
    "EKS",
    "Lambda",
    "S3",
    "EC2",
    "CloudFormation",
    "Cloud Run",
    "Serverless"
  ],
  methodologies: [
    "Agile",
    "Scrum",
    "CI/CD",
    "TDD",
    "Microservices",
    "Event-driven architecture",
    "Distributed systems",
    "System design",
    "Observability",
    "Security",
    "DevOps",
    "MLOps",
    "Data pipelines",
    "ETL",
    "API design",
    "Performance optimization",
    "Reliability engineering"
  ],
  tools: [
    "Git",
    "GitHub",
    "GitHub Actions",
    "GitLab CI",
    "Jenkins",
    "CircleCI",
    "Kafka",
    "RabbitMQ",
    "SQS",
    "SNS",
    "Datadog",
    "Prometheus",
    "Grafana",
    "OpenTelemetry",
    "Sentry",
    "Jira",
    "Segment",
    "Tableau",
    "Power BI"
  ]
};

const CANONICAL_ALIASES = new Map<string, string>([
  ["golang", "Go"],
  ["google cloud", "GCP"],
  ["tailwind", "Tailwind CSS"],
  ["rest api", "REST"],
  ["rest apis", "REST"],
  ["apis", "API design"],
  ["api", "API design"],
  ["continuous integration", "CI/CD"],
  ["continuous delivery", "CI/CD"],
  ["continuous deployment", "CI/CD"]
]);

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function containsTerm(text: string, term: string) {
  const escaped = escapeRegExp(term);
  return new RegExp(`(^|[^A-Za-z0-9+#.])${escaped}([^A-Za-z0-9+#.]|$)`, "i").test(text);
}

export function canonicalSkill(value: string) {
  const normalized = normalizeKeyword(value);
  return CANONICAL_ALIASES.get(normalized) ?? normalizeWhitespace(value);
}

export function getSkillTaxonomy() {
  return SKILL_TAXONOMY;
}

export function extractKnownSkillCategories(text: string) {
  const source = normalizeWhitespace(text);
  const categories = Object.entries(SKILL_TAXONOMY).reduce<Record<SkillCategoryKey, string[]>>(
    (accumulator, [category, terms]) => {
      accumulator[category as SkillCategoryKey] = dedupeStrings(
        terms.filter((term) => containsTerm(source, term)).map(canonicalSkill)
      );
      return accumulator;
    },
    {
      languages: [],
      frameworks: [],
      databases: [],
      cloudPlatforms: [],
      methodologies: [],
      tools: []
    }
  );

  return categories;
}

export function flattenSkillCategories(categories: Record<SkillCategoryKey, string[]>) {
  return dedupeStrings(Object.values(categories).flat().map(canonicalSkill));
}

export function extractKnownSkills(text: string) {
  return flattenSkillCategories(extractKnownSkillCategories(text));
}

export function skillExistsInText(text: string, skill: string) {
  const canonical = canonicalSkill(skill);
  return containsTerm(text, canonical) || containsTerm(text, skill);
}
