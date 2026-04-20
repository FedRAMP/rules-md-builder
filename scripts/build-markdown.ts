import { mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Handlebars from "handlebars";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = path.resolve(SCRIPT_DIR, "..");

export const RULES_FILE = path.join(
  ROOT_DIR,
  "rules",
  "fedramp-consolidated-rules.json",
);
const TEMPLATE_FILE = path.join(ROOT_DIR, "templates", "template.hbs");
const PARTIALS_DIR = path.join(ROOT_DIR, "templates", "partials");
export const OUTPUT_DIR = path.join(ROOT_DIR, "output");

type Version = "20x" | "rev5";

interface RulesDocument {
  FRD: DefinitionsSource;
  FRR: Record<string, RequirementDocumentSource>;
  KSI: Record<string, KsiThemeSource>;
}

interface AuthoritySource {
  description?: string;
  reference?: string;
  reference_url?: string;
  delegation?: string;
  delegation_url?: string;
}

interface EffectiveEntrySource {
  is?: string;
  current_status?: string;
  date?: Record<string, string>;
  comments?: string[];
  signup_url?: string;
  warnings?: string[];
}

interface FrontMatterSource {
  authority?: AuthoritySource[];
  purpose?: string;
}

interface InfoSource {
  name: string;
  short_name?: string;
  web_name: string;
  effective?: Partial<Record<Version, EffectiveEntrySource>>;
  front_matter?: FrontMatterSource;
  labels?: Record<string, { name?: string; description?: string }>;
}

interface ChangeLogSource {
  date?: string;
  comment?: string;
  prev?: string;
}

interface ExampleSource {
  id?: string;
  key_tests?: string[];
  examples?: string[];
}

interface VariantSource {
  statement?: string;
  pain_timeframes?: Array<{
    pain?: number | string;
    max_days_irv_lev?: number | string;
    max_days_nirv_lev?: number | string;
    max_days_nlev?: number | string;
  }>;
}

interface RequirementEntrySource {
  name?: string;
  statement?: string;
  following_information?: string[];
  following_information_bullets?: string[];
  varies_by_class?: Record<string, VariantSource>;
  varies_by_level?: Record<string, VariantSource>;
  note?: string;
  notes?: string[];
  danger?: string;
  notification?: boolean;
  affects?: string[];
  controls?: string[];
  reference?: string;
  reference_url?: string;
  terms?: string[];
  examples?: ExampleSource[];
  updated?: ChangeLogSource[];
  fka?: string;
}

interface DefinitionsSource {
  info: InfoSource;
  data: {
    both?: Record<string, DefinitionEntrySource>;
  };
}

interface DefinitionEntrySource {
  term: string;
  definition?: string;
  note?: string;
  notes?: string[];
  reference?: string;
  reference_url?: string;
  alts?: string[];
  updated?: ChangeLogSource[];
  fka?: string;
}

interface RequirementDocumentSource {
  info: InfoSource;
  data: Partial<
    Record<
      Version | "both",
      Record<string, Record<string, RequirementEntrySource>>
    >
  >;
}

interface KsiThemeSource {
  id?: string;
  name: string;
  web_name: string;
  short_name?: string;
  theme?: string;
  indicators: Record<string, RequirementEntrySource>;
}

interface EffectiveEntryViewModel {
  versionLabel: string;
  statusLabel: string;
  currentStatus?: string;
  dateLines: Array<{ label: string; value: string }>;
  comments: string[];
  signupUrl?: string;
  warnings: string[];
}

interface AuthorityViewModel {
  description?: string;
  reference?: string;
  referenceUrl?: string;
  delegation?: string;
  delegationUrl?: string;
}

interface PainTimeframeViewModel {
  pain: string;
  maxDaysIrvLev: string;
  maxDaysNirvLev: string;
  maxDaysNlev: string;
}

interface VariantViewModel {
  title: string;
  statementParagraphs: string[];
  painTimeframes: PainTimeframeViewModel[];
}

interface ExampleViewModel {
  title: string;
  keyTests: string[];
  examples: string[];
}

interface TermLinkViewModel {
  label: string;
  href: string;
}

interface RequirementViewModel {
  id: string;
  title: string;
  formerId?: string;
  changelog: Array<{
    date: string;
    comment: string;
    previousValue?: string;
  }>;
  statementParagraphs: string[];
  variantSections: VariantViewModel[];
  numberedItems: string[];
  bulletItems: string[];
  noteParagraphs: string[];
  notes: string[];
  dangerParagraphs: string[];
  notification: boolean;
  affects: string[];
  controlLinks: Array<{ label: string; url: string }>;
  reference?: { label: string; url: string };
  examples: ExampleViewModel[];
  terms: TermLinkViewModel[];
}

interface DefinitionViewModel {
  id: string;
  anchorId: string;
  term: string;
  formerId?: string;
  changelog: Array<{
    date: string;
    comment: string;
    previousValue?: string;
  }>;
  definitionParagraphs: string[];
  noteParagraphs: string[];
  notes: string[];
  reference?: { label: string; url: string };
  alternateTerms: string[];
}

interface SectionViewModel {
  title: string;
  descriptionParagraphs: string[];
  requirements: RequirementViewModel[];
}

interface DocumentViewModel {
  title: string;
  effectiveEntries: EffectiveEntryViewModel[];
  authority: AuthorityViewModel[];
  purposeParagraphs: string[];
  isDefinitionDocument: boolean;
  isRequirementsDocument: boolean;
  isKsiDocument: boolean;
  definitions: DefinitionViewModel[];
  sections: SectionViewModel[];
  themeParagraphs: string[];
  indicators: RequirementViewModel[];
}

export interface BuildArtifact {
  relativePath: string;
  outputPath: string;
  title: string;
  documentType: "FRD" | "FRR" | "KSI";
  context: DocumentViewModel;
}

export interface BuildSummary {
  artifactCount: number;
  artifacts: BuildArtifact[];
}

const CONTROL_FREAK_BASE_URL = "https://controlfreak.risk-redux.io/controls/";

function splitParagraphs(value?: string): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(/\n\s*\n/g)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function humanizeVersion(version: Version): string {
  return version === "20x" ? "20x" : "Rev5";
}

function humanizeStatus(value?: string): string {
  if (!value) {
    return "Unknown";
  }

  return value.charAt(0).toUpperCase() + value.slice(1);
}

function isApplicable(entry?: EffectiveEntrySource): boolean {
  return Boolean(entry?.is && entry.is.toLowerCase() !== "no");
}

function slugifyTerm(term: string): string {
  return term
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function controlUrl(controlId: string): string {
  if (controlId.includes(".")) {
    const [main = "", sub = ""] = controlId.split(".");
    const [prefix = "", number = ""] = main.split("-");

    return `${CONTROL_FREAK_BASE_URL}${prefix.toUpperCase()}-${number.padStart(2, "0")}(${sub.padStart(2, "0")})`;
  }

  const [prefix = "", number = ""] = controlId.split("-");
  return `${CONTROL_FREAK_BASE_URL}${prefix.toUpperCase()}-${number.padStart(2, "0")}`;
}

function toAuthorityViewModel(
  authority: AuthoritySource[] = [],
): AuthorityViewModel[] {
  return authority.map((entry) => ({
    description: entry.description,
    reference: entry.reference,
    referenceUrl: entry.reference_url,
    delegation: entry.delegation,
    delegationUrl: entry.delegation_url,
  }));
}

function toEffectiveEntries(
  effective: Partial<Record<Version, EffectiveEntrySource>> | undefined,
  versions: Version[],
): EffectiveEntryViewModel[] {
  return versions
    .map((version) => {
      const entry = effective?.[version];
      if (!entry) {
        return null;
      }

      return {
        versionLabel: humanizeVersion(version),
        statusLabel: humanizeStatus(entry.is),
        currentStatus: entry.current_status,
        dateLines: Object.entries(entry.date ?? {}).map(([key, value]) => ({
          label: titleCase(key),
          value,
        })),
        comments: entry.comments ?? [],
        signupUrl: entry.signup_url,
        warnings: entry.warnings ?? [],
      };
    })
    .filter((entry): entry is EffectiveEntryViewModel => entry !== null);
}

function toChangeLog(updated: ChangeLogSource[] = []) {
  return updated
    .filter((entry) => entry.date || entry.comment || entry.prev)
    .map((entry) => ({
      date: entry.date ?? "Undated",
      comment: entry.comment ?? "",
      previousValue: entry.prev,
    }));
}

function buildVariantSections(
  entry: RequirementEntrySource,
): VariantViewModel[] {
  const sections: VariantViewModel[] = [];

  for (const [className, classEntry] of Object.entries(
    entry.varies_by_class ?? {},
  )) {
    sections.push({
      title: `Class ${className.toUpperCase()}`,
      statementParagraphs: splitParagraphs(classEntry.statement),
      painTimeframes: (classEntry.pain_timeframes ?? []).map((timeframe) => ({
        pain: String(timeframe.pain ?? ""),
        maxDaysIrvLev: String(timeframe.max_days_irv_lev ?? ""),
        maxDaysNirvLev: String(timeframe.max_days_nirv_lev ?? ""),
        maxDaysNlev: String(timeframe.max_days_nlev ?? ""),
      })),
    });
  }

  for (const [levelName, levelEntry] of Object.entries(
    entry.varies_by_level ?? {},
  )) {
    sections.push({
      title: titleCase(levelName),
      statementParagraphs: splitParagraphs(levelEntry.statement),
      painTimeframes: (levelEntry.pain_timeframes ?? []).map((timeframe) => ({
        pain: String(timeframe.pain ?? ""),
        maxDaysIrvLev: String(timeframe.max_days_irv_lev ?? ""),
        maxDaysNirvLev: String(timeframe.max_days_nirv_lev ?? ""),
        maxDaysNlev: String(timeframe.max_days_nlev ?? ""),
      })),
    });
  }

  return sections;
}

function buildTermLinks(
  terms: string[] = [],
  definitionsRelativePath: string,
): TermLinkViewModel[] {
  return terms.map((term) => ({
    label: term,
    href: `${definitionsRelativePath}#${slugifyTerm(term)}`,
  }));
}

function buildRequirementViewModel(
  id: string,
  entry: RequirementEntrySource,
  definitionsRelativePath: string,
): RequirementViewModel {
  return {
    id,
    title: entry.name ?? id,
    formerId: entry.fka,
    changelog: toChangeLog(entry.updated),
    statementParagraphs: splitParagraphs(entry.statement),
    variantSections: buildVariantSections(entry),
    numberedItems: entry.following_information ?? [],
    bulletItems: entry.following_information_bullets ?? [],
    noteParagraphs: splitParagraphs(entry.note),
    notes: entry.notes ?? [],
    dangerParagraphs: splitParagraphs(entry.danger),
    notification: Boolean(entry.notification),
    affects: entry.affects ?? [],
    controlLinks: (entry.controls ?? []).map((controlId) => ({
      label: controlId.toUpperCase(),
      url: controlUrl(controlId),
    })),
    reference:
      entry.reference && entry.reference_url
        ? {
            label: entry.reference,
            url: entry.reference_url,
          }
        : undefined,
    examples: (entry.examples ?? []).map((example) => ({
      title: example.id ?? "Example",
      keyTests: example.key_tests ?? [],
      examples: example.examples ?? [],
    })),
    terms: buildTermLinks(entry.terms, definitionsRelativePath),
  };
}

function buildDefinitionViewModel(
  id: string,
  entry: DefinitionEntrySource,
): DefinitionViewModel {
  return {
    id,
    anchorId: slugifyTerm(entry.term),
    term: entry.term,
    formerId: entry.fka,
    changelog: toChangeLog(entry.updated),
    definitionParagraphs: splitParagraphs(entry.definition),
    noteParagraphs: splitParagraphs(entry.note),
    notes: entry.notes ?? [],
    reference:
      entry.reference && entry.reference_url
        ? {
            label: entry.reference,
            url: entry.reference_url,
          }
        : undefined,
    alternateTerms: entry.alts ?? [],
  };
}

function buildSectionViewModels(
  document: RequirementDocumentSource,
  version: Version,
  definitionsRelativePath: string,
): SectionViewModel[] {
  const sections = new Map<string, SectionViewModel>();

  for (const bucketName of [version, "both"] as const) {
    const bucket = document.data[bucketName];
    if (!bucket) {
      continue;
    }

    for (const [labelKey, requirements] of Object.entries(bucket)) {
      const existingSection = sections.get(labelKey);
      const label = document.info.labels?.[labelKey];
      const section = existingSection ?? {
        title: label?.name ?? labelKey,
        descriptionParagraphs: splitParagraphs(label?.description),
        requirements: [],
      };

      for (const [id, requirement] of Object.entries(requirements)) {
        section.requirements.push(
          buildRequirementViewModel(id, requirement, definitionsRelativePath),
        );
      }

      sections.set(labelKey, section);
    }
  }

  return Array.from(sections.values());
}

function buildDocumentContext(
  title: string,
  options: Partial<DocumentViewModel>,
): DocumentViewModel {
  return {
    title,
    effectiveEntries: options.effectiveEntries ?? [],
    authority: options.authority ?? [],
    purposeParagraphs: options.purposeParagraphs ?? [],
    isDefinitionDocument: options.isDefinitionDocument ?? false,
    isRequirementsDocument: options.isRequirementsDocument ?? false,
    isKsiDocument: options.isKsiDocument ?? false,
    definitions: options.definitions ?? [],
    sections: options.sections ?? [],
    themeParagraphs: options.themeParagraphs ?? [],
    indicators: options.indicators ?? [],
  };
}

function buildPreviewIndex(artifacts: BuildArtifact[]): string {
  const definitions = artifacts.find(
    (artifact) => artifact.relativePath === "definitions.md",
  );
  const twentyX = artifacts.filter(
    (artifact) =>
      artifact.documentType === "FRR" &&
      artifact.relativePath.startsWith("20x/"),
  );
  const rev5 = artifacts.filter(
    (artifact) =>
      artifact.documentType === "FRR" &&
      artifact.relativePath.startsWith("rev5/"),
  );
  const ksi = artifacts.filter((artifact) =>
    artifact.relativePath.startsWith("20x/key-security-indicators/"),
  );

  const lines = [
    "# FedRAMP Rules Preview",
    "",
    "This page is generated only for quick previewing of markdown files as the Consolidated Rules are edited, it is NOT a final format or structure and only shows rules generated from JSON source.",
    "",
    "Use the sidebar to browse everything under `output/`, or jump in here:",
    "",
  ];

  if (definitions) {
    lines.push("- [Definitions](definitions/)", "");
  }

  if (twentyX.length) {
    lines.push("## 20x", "");
    for (const artifact of twentyX) {
      lines.push(`- [${artifact.title}](${artifact.relativePath})`);
    }
    lines.push("");
  }

  if (rev5.length) {
    lines.push("## Rev5", "");
    for (const artifact of rev5) {
      lines.push(`- [${artifact.title}](${artifact.relativePath})`);
    }
    lines.push("");
  }

  if (ksi.length) {
    lines.push("## Key Security Indicators", "");
    for (const artifact of ksi) {
      lines.push(`- [${artifact.title}](${artifact.relativePath})`);
    }
    lines.push("");
  }

  return `${lines.join("\n").trim()}\n`;
}

async function loadTemplate(): Promise<(context: DocumentViewModel) => string> {
  const engine = Handlebars.create();
  const partialFiles = (await readdir(PARTIALS_DIR)).filter((fileName) =>
    fileName.endsWith(".hbs"),
  );

  for (const partialFile of partialFiles) {
    const partialName = path.basename(partialFile, ".hbs");
    const partialSource = await readFile(
      path.join(PARTIALS_DIR, partialFile),
      "utf8",
    );
    engine.registerPartial(partialName, partialSource);
  }

  const templateSource = await readFile(TEMPLATE_FILE, "utf8");
  return engine.compile(templateSource, {
    noEscape: true,
  });
}

export async function loadRules(): Promise<RulesDocument> {
  const source = await readFile(RULES_FILE, "utf8");
  return JSON.parse(source) as RulesDocument;
}

export function collectArtifacts(rules: RulesDocument): BuildArtifact[] {
  const artifacts: BuildArtifact[] = [];
  const authority = toAuthorityViewModel(
    rules.FRD.info.front_matter?.authority,
  );
  const purposeParagraphs = splitParagraphs(
    rules.FRD.info.front_matter?.purpose,
  );

  artifacts.push({
    relativePath: "definitions.md",
    outputPath: path.join(OUTPUT_DIR, "definitions.md"),
    title: rules.FRD.info.name,
    documentType: "FRD",
    context: buildDocumentContext(rules.FRD.info.name, {
      effectiveEntries: toEffectiveEntries(rules.FRD.info.effective, [
        "20x",
        "rev5",
      ]),
      authority,
      purposeParagraphs,
      isDefinitionDocument: true,
      definitions: Object.entries(rules.FRD.data.both ?? {}).map(
        ([id, entry]) => buildDefinitionViewModel(id, entry),
      ),
    }),
  });

  for (const document of Object.values(rules.FRR)) {
    const frontMatter = document.info.front_matter;

    for (const version of ["20x", "rev5"] as const) {
      const effectiveEntry = document.info.effective?.[version];
      if (!isApplicable(effectiveEntry)) {
        continue;
      }

      artifacts.push({
        relativePath: path.join(version, `${document.info.web_name}.md`),
        outputPath: path.join(
          OUTPUT_DIR,
          version,
          `${document.info.web_name}.md`,
        ),
        title: document.info.name,
        documentType: "FRR",
        context: buildDocumentContext(document.info.name, {
          effectiveEntries: toEffectiveEntries(document.info.effective, [
            version,
          ]),
          authority: toAuthorityViewModel(frontMatter?.authority),
          purposeParagraphs: splitParagraphs(frontMatter?.purpose),
          isRequirementsDocument: true,
          sections: buildSectionViewModels(
            document,
            version,
            "../definitions/",
          ),
        }),
      });
    }
  }

  for (const theme of Object.values(rules.KSI)) {
    artifacts.push({
      relativePath: path.join(
        "20x",
        "key-security-indicators",
        `${theme.web_name}.md`,
      ),
      outputPath: path.join(
        OUTPUT_DIR,
        "20x",
        "key-security-indicators",
        `${theme.web_name}.md`,
      ),
      title: theme.name,
      documentType: "KSI",
      context: buildDocumentContext(theme.name, {
        isKsiDocument: true,
        themeParagraphs: splitParagraphs(theme.theme),
        indicators: Object.entries(theme.indicators).map(([id, entry]) =>
          buildRequirementViewModel(id, entry, "../../definitions/"),
        ),
      }),
    });
  }

  return artifacts;
}

export async function buildMarkdown(): Promise<BuildSummary> {
  const rules = await loadRules();
  const template = await loadTemplate();
  const artifacts = collectArtifacts(rules);

  await rm(OUTPUT_DIR, { recursive: true, force: true });
  await mkdir(path.join(OUTPUT_DIR, "20x", "key-security-indicators"), {
    recursive: true,
  });
  await mkdir(path.join(OUTPUT_DIR, "rev5"), { recursive: true });

  for (const artifact of artifacts) {
    const rendered = `${template(artifact.context).trim()}\n`;
    await writeFile(artifact.outputPath, rendered, "utf8");
  }

  await writeFile(
    path.join(OUTPUT_DIR, "index.md"),
    buildPreviewIndex(artifacts),
    "utf8",
  );

  return {
    artifactCount: artifacts.length,
    artifacts,
  };
}

if (import.meta.main) {
  buildMarkdown()
    .then((summary) => {
      console.log(`Generated ${summary.artifactCount} markdown files.`);
      for (const artifact of summary.artifacts) {
        console.log(`- ${artifact.relativePath}`);
      }
    })
    .catch((error) => {
      console.error("Failed to build markdown files.");
      console.error(error);
      process.exitCode = 1;
    });
}
