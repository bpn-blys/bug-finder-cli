import os from "os";
import path from "path";

const bugFinderDocName = "bug-finder.md";

export const config = {
	app: {
		name: "bug-finder-cli",
		description: "Analyze a bug description against a local repository using the GitHub Copilot SDK.",
		bugJsonArg: "<bug.json>",
		bugJsonArgDescription: "Path to the bug JSON file",
		usage: "<bug.json>",
		bugJsonHelpText:
			'\nBug JSON schema:\n  [\n    {\n      "title": "Bug title",\n      "description": "Detailed description of the bug",\n      "status": "todo",\n      "bug-details": null,\n      "localRepoUrls": ["/absolute/path/to/local/repo"],\n      "imagePaths": ["/absolute/path/to/screenshot.png"]\n    }\n  ]\n\nNotes:\n- status is optional; when omitted it defaults to todo.\n- if provided, status must be one of: todo, in-progress, done.\n- bug-details is optional and is filled with structured findings after analysis.\n- localRepoUrl (string) is still supported for a single repository entry.\n- imagePaths is optional.',
	},
	files: {
		bugFinderDocName,
	},
	bug: {
		status: {
			todo: "todo",
			inProgress: "in-progress",
			done: "done",
		},
		statusDisplay: "todo, in-progress, done",
		confidenceScore: {
			min: 0,
			max: 1,
		},
	},
	copilot: {
		env: {
			model: "COPILOT_MODEL",
			cliPath: "COPILOT_PATH",
		},
		defaults: {
			model: "gpt-4.1",
			cliPath: path.join(os.homedir(), ".local", "bin", "copilot"),
			logDirName: "copilot-logs",
			analysisTimeoutMs: 10 * 60 * 1000,
			bugFinderDocTimeoutMs: 3 * 60 * 1000,
		},
		bugFinderDocSystemMessage: `
You are a documentation engineer who generates concise architecture guides.
	Produce only the contents of a ${bugFinderDocName} file for the attached repository.
Focus on creating an "Architecture Index" that lists high-level directories or modules with short descriptions (1-2 sentences) and how they relate to the project.
Keep the format purely Markdown and avoid analysis, to-do lists, or narrative text.
`.trim(),
	},
	toolUsage: {
		maxSnippetLength: 160,
	},
} as const;

export const resolveCopilotCliPath = () =>
	process.env[config.copilot.env.cliPath]?.trim() || config.copilot.defaults.cliPath;

export const resolveCopilotLogDir = () => path.join(process.cwd(), config.copilot.defaults.logDirName);