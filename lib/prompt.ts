import type { BugRecord } from "./bug";
import { config } from "../constants/config";

export const buildSystemMessage = () =>
  `
You are a senior software engineer specializing in root-cause analysis.
Use the repository tools to inspect the codebases listed in the prompt, and consult each repository's '${config.files.bugFinderDocName}' (when present) as the architecture index—cite it when referencing its entries and let its structure guide your investigation.
If images are attached, use them as supporting evidence.

Return ONLY a valid JSON object with this exact shape:
{
  "probableCause": "string",
  "reason": "string",
  "suggestedFixes": ["string"],
  "confidenceScore": 0.0,
  "evidence": [{"file": "string", "lines": "string", "detail": "string"}]
}

Requirements:
- Base conclusions on repository evidence and include file paths and line references when possible.
- If evidence is limited, state it clearly in "reason" and "evidence".
- confidenceScore must be a number between 0 and 1.
- Do not include markdown code fences or any text outside the JSON object.
  `.trim();

export const buildPrompt = (bug: BugRecord, repoPaths: string[]) =>
  `
Bug title: ${bug.title}

Bug description:
${bug.description}

Current workflow status: ${bug.status}

Repository roots:
${repoPaths.map((repoPath) => `- ${repoPath}`).join("\n")}

Bug images:
${bug.imagePaths && bug.imagePaths.length > 0 ? bug.imagePaths.map((imagePath) => `- ${imagePath}`).join("\n") : "None"}

Task:
Analyze the repository to find the most probable cause of the bug.
Do not rely on the bug title or description as factual; treat them only as hints.
Investigate the codebase to determine the actual root cause and base conclusions on evidence.
Explain the reasoning, propose fixes, and provide a confidence score.
  `.trim();
