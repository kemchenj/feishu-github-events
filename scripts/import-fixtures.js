import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { ACTION_EVENTS } from "../src/action-events.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const paths = args.filter((item) => item !== "--dry-run");

if (paths.length === 0) {
  console.error("Usage: npm run fixtures:import -- <payload-json-or-directory> [--dry-run]");
  process.exitCode = 1;
} else {
  const files = paths.flatMap((item) => collectJsonFiles(item));
  const imported = [];

  for (const file of files) {
    const eventName = eventNameFromFile(file);
    if (!eventName) {
      continue;
    }

    const payload = JSON.parse(readFileSync(file, "utf8"));
    const target = path.join("fixtures", "events", `${eventName}.json`);
    imported.push({ eventName, file, target });

    if (!dryRun) {
      writeFileSync(target, `${JSON.stringify(payload, null, 2)}\n`);
    }
  }

  if (imported.length === 0) {
    console.error("No importable payload files found. Expected files like push_*.json or pull_request_*.json.");
    process.exitCode = 1;
  } else {
    for (const item of imported) {
      const prefix = dryRun ? "would import" : "imported";
      console.log(`${prefix} ${item.eventName}: ${item.file} -> ${item.target}`);
    }
  }
}

function collectJsonFiles(item) {
  const stats = statSync(item);
  if (stats.isDirectory()) {
    return readdirSync(item)
      .flatMap((entry) => collectJsonFiles(path.join(item, entry)))
      .filter((file) => !path.basename(file).startsWith("_"));
  }

  return item.endsWith(".json") && !path.basename(item).startsWith("_") ? [item] : [];
}

function eventNameFromFile(file) {
  const name = path.basename(file, ".json");
  return [...ACTION_EVENTS]
    .sort((left, right) => right.length - left.length)
    .find((eventName) => name === eventName || name.startsWith(`${eventName}_`));
}
