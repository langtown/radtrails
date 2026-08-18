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

// Workers Builds runs the build and deploy phases separately. Apply pending
// schema changes before uploading the stable alias because that alias shares the
// production D1 database. Local builds and OpenNext's nested Next.js build skip
// both remote operations.
if (!runNextBuild && process.env.WORKERS_CI === "1") {
	const dryRun = process.env.RADTRAILS_PREVIEW_UPLOAD_DRY_RUN === "1";
	const migrationScript = dryRun ? "db:migrate:local" : "db:migrate:remote";
	const migrationResult = spawnSync("npm", ["run", migrationScript], {
		env: process.env,
		shell: process.platform === "win32",
		stdio: "inherit",
	});

	if (migrationResult.status !== 0) {
		process.exit(migrationResult.status ?? 1);
	}

	const previewArgs = ["run", "cf:preview:upload"];

	// Exercise the CI hook safely with local D1 and a dry-run version upload.
	if (dryRun) {
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
