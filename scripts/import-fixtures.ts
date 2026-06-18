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
    const fixture = fixtureFromFile(file);
    if (!fixture) {
      continue;
    }

    const payload = JSON.parse(readFileSync(file, "utf8"));
    const target = path.join("fixtures", "events", fixture.eventName, `${fixture.caseName}.json`);
    imported.push({ eventName: fixture.eventName, file, target });

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

function collectJsonFiles(item: string): string[] {
  const stats = statSync(item);
  if (stats.isDirectory()) {
    return readdirSync(item)
      .flatMap((entry) => collectJsonFiles(path.join(item, entry)))
      .filter((file) => !path.basename(file).startsWith("_"));
  }

  return item.endsWith(".json") && !path.basename(item).startsWith("_") ? [item] : [];
}

function fixtureFromFile(file: string): { eventName: string; caseName: string } | undefined {
  const name = path.basename(file, ".json");
  const eventName = [...ACTION_EVENTS]
    .sort((left, right) => right.length - left.length)
    .find((eventName) => name === eventName || name.startsWith(`${eventName}_`));
  if (!eventName) {
    return undefined;
  }

  const suffix = name === eventName ? "imported" : name.slice(eventName.length + 1);
  return {
    eventName,
    caseName: slug(suffix)
  };
}

function slug(value: string): string {
  return value
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "imported";
}
