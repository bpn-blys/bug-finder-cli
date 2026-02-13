import type { BugInput } from "./bug";

export const buildSystemMessage = () =>
  `
You are a senior software engineer specializing in root-cause analysis.
Use the repository tools to inspect the codebases listed in the prompt, and consult each repository's 'bug-finder.md' (when present) as the architecture index—cite it when referencing its entries and let its structure guide your investigation.
If images are attached, use them as supporting evidence.

Return a concise, human-readable report with EXACT headings:
🐛 Probable Cause
💡 Reason
🔧 Suggested Fixes
📊 Confidence Score

Requirements:
- Base conclusions on evidence from the repository (cite file paths and line numbers when possible).
- If evidence is limited, say so explicitly.
- Confidence score must be a single number between 0 and 1.
- Do not output JSON or markdown code fences.
  `.trim();

export const buildPrompt = (bug: BugInput, repoPaths: string[]) =>
  `
Bug title: ${bug.title}

Bug description:
${bug.description}

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
