import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";

const runNextBuild = process.env.RADTRAILS_OPENNEXT_BUILD === "1";
const command = runNextBuild ? "next" : "opennextjs-cloudflare";
const args = ["build"];

if (!runNextBuild) {
	rmSync(".open-next", { recursive: true, force: true });
}

const result = spawnSync(command, args, {
	env: {
		...process.env,
		RADTRAILS_OPENNEXT_BUILD: "1",
	},
	shell: process.platform === "win32",
	stdio: "inherit",
});

if (result.status !== 0) {
	process.exit(result.status ?? 1);
}

// Workers Builds runs the build and deploy phases separately. Upload the stable
// alias after the outer OpenNext build so Cloudflare's default deploy commands
// can remain unchanged. Local builds and OpenNext's nested Next.js build skip it.
if (!runNextBuild && process.env.WORKERS_CI === "1") {
	const previewArgs = ["run", "cf:preview:upload"];

	// Lets CI behavior be exercised safely without creating a remote version.
	if (process.env.RADTRAILS_PREVIEW_UPLOAD_DRY_RUN === "1") {
		previewArgs.push("--", "--dry-run");
	}

	const previewResult = spawnSync("npm", previewArgs, {
		env: process.env,
		shell: process.platform === "win32",
		stdio: "inherit",
	});

	process.exit(previewResult.status ?? 1);
}

process.exit(0);
