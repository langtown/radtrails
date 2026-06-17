import { spawnSync } from "node:child_process";

const runNextBuild = process.env.RADTRAILS_OPENNEXT_BUILD === "1";
const command = runNextBuild ? "next" : "opennextjs-cloudflare";
const args = ["build"];

const result = spawnSync(command, args, {
	env: {
		...process.env,
		RADTRAILS_OPENNEXT_BUILD: "1",
	},
	shell: process.platform === "win32",
	stdio: "inherit",
});

process.exit(result.status ?? 1);
