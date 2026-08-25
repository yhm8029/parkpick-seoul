#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const checks = [];
const failures = [];

function pass(name, detail = "") {
  checks.push({ name, detail });
  console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
}

function fail(name, error) {
  const message = error instanceof Error ? error.message : String(error);
  failures.push({ name, message });
  console.error(`FAIL  ${name} — ${message}`);
}

async function runCheck(name, fn) {
  try {
    const detail = await fn();
    pass(name, typeof detail === "string" ? detail : "");
  } catch (error) {
    fail(name, error);
  }
}

function loadTypeScript() {
  try {
    return require("typescript");
  } catch {
    const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
    const globalRoot = execFileSync(npmCommand, ["root", "-g"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    return require(path.join(globalRoot, "typescript"));
  }
}

async function walk(directory, output = []) {
  const ignored = new Set([".git", ".next", ".vercel", "node_modules", "coverage", "dist"]);
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (ignored.has(entry.name)) continue;
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) await walk(absolute, output);
    else output.push(absolute);
  }
  return output;
}

function formatDiagnostics(ts, diagnostics) {
  return diagnostics.map((diagnostic) => {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
    if (!diagnostic.file || diagnostic.start === undefined) return message;
    const position = diagnostic.file.getLineAndCharacterOfPosition(diagnostic.start);
    return `${path.relative(root, diagnostic.file.fileName)}:${position.line + 1}:${position.character + 1} ${message}`;
  }).join("\n");
}

async function compileRuntimeModule(ts, sourcePath, targetPath, replacements = {}) {
  const source = await readFile(sourcePath, "utf8");
  const result = ts.transpileModule(source, {
    fileName: sourcePath,
    reportDiagnostics: true,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ES2022,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      strict: true,
    },
  });
  const errors = (result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error);
  if (errors.length) throw new Error(formatDiagnostics(ts, errors));
  let output = result.outputText;
  for (const [from, to] of Object.entries(replacements)) output = output.replaceAll(from, to);
  await writeFile(targetPath, output, "utf8");
}

const ts = loadTypeScript();
const allFiles = await walk(root);

await runCheck("configuration JSON", async () => {
  for (const file of ["package.json", "tsconfig.json"]) {
    JSON.parse(await readFile(path.join(root, file), "utf8"));
  }
  return "package.json, tsconfig.json";
});

await runCheck("environment template", async () => {
  const required = [
    "SEOUL_OPEN_API_KEY",
    "KAKAO_REST_API_KEY",
    "KAKAO_MOBILITY_REST_API_KEY",
    "NEXT_PUBLIC_KAKAO_MAP_JAVASCRIPT_KEY",
    "NEXT_PUBLIC_KAKAO_JAVASCRIPT_KEY",
    "NEXT_PUBLIC_NAVER_MAP_NCP_KEY_ID",
    "NEXT_PUBLIC_NAVER_APP_NAME",
  ];
  const content = await readFile(path.join(root, ".env.example"), "utf8");
  const missing = required.filter((key) => !new RegExp(`^${key}=`, "m").test(content));
  assert.deepEqual(missing, [], `missing keys: ${missing.join(", ")}`);
  return `${required.length} required keys`;
});

await runCheck("GitHub Actions disabled", async () => {
  const workflowDir = path.join(root, ".github", "workflows");
  if (!existsSync(workflowDir)) return "workflow directory absent";
  const workflowFiles = (await walk(workflowDir)).filter((file) => /\.(ya?ml)$/i.test(file));
  assert.equal(workflowFiles.length, 0, `workflow files remain: ${workflowFiles.map((file) => path.relative(root, file)).join(", ")}`);
  return "no workflow YAML";
});

await runCheck("merge conflict markers", async () => {
  const textFiles = allFiles.filter((file) => /\.(?:[cm]?[jt]sx?|json|md|css|ya?ml|d\.ts|svg|html)$/i.test(file));
  const bad = [];
  for (const file of textFiles) {
    const content = await readFile(file, "utf8");
    if (/^(?:<{7}|={7}|>{7})(?: |$)/m.test(content)) bad.push(path.relative(root, file));
  }
  assert.deepEqual(bad, [], `conflict markers found in ${bad.join(", ")}`);
  return `${textFiles.length} files scanned`;
});

await runCheck("TypeScript and TSX syntax", async () => {
  const sourceFiles = allFiles.filter((file) => /\.(?:ts|tsx)$/i.test(file) && !/\.d\.ts$/i.test(file));
  const diagnostics = [];
  for (const file of sourceFiles) {
    const source = await readFile(file, "utf8");
    const result = ts.transpileModule(source, {
      fileName: file,
      reportDiagnostics: true,
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        jsx: ts.JsxEmit.ReactJSX,
        isolatedModules: true,
      },
    });
    diagnostics.push(...(result.diagnostics ?? []).filter((item) => item.category === ts.DiagnosticCategory.Error));
  }
  assert.equal(diagnostics.length, 0, formatDiagnostics(ts, diagnostics));
  return `${sourceFiles.length} files transpiled`;
});

await runCheck("domain logic smoke tests", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "parkpick-repo-check-"));
  try {
    await compileRuntimeModule(ts, path.join(root, "lib", "utils.ts"), path.join(tempDir, "utils.mjs"));
    await compileRuntimeModule(ts, path.join(root, "lib", "domain", "distance.ts"), path.join(tempDir, "distance.mjs"));
    await compileRuntimeModule(ts, path.join(root, "lib", "domain", "fees.ts"), path.join(tempDir, "fees.mjs"));
    await compileRuntimeModule(
      ts,
      path.join(root, "lib", "domain", "recommend.ts"),
      path.join(tempDir, "recommend.mjs"),
      {
        '"@/lib/domain/distance"': '"./distance.mjs"',
        '"@/lib/domain/fees"': '"./fees.mjs"',
        '"@/lib/utils"': '"./utils.mjs"',
      },
    );

    const fees = await import(`${pathToFileURL(path.join(tempDir, "fees.mjs")).href}?v=${Date.now()}`);
    const recommendations = await import(`${pathToFileURL(path.join(tempDir, "recommend.mjs")).href}?v=${Date.now()}`);

    assert.equal(fees.calculateParkingFee(31, {
      isFree: false,
      baseMinutes: 30,
      baseFee: 1000,
      additionalMinutes: 10,
      additionalFee: 500,
    }), 1500);
    assert.equal(fees.calculateParkingFee(1000, {
      isFree: false,
      baseMinutes: 10,
      baseFee: 1000,
      additionalMinutes: 10,
      additionalFee: 1000,
      dailyMaximumFee: 20000,
    }), 20000);
    assert.equal(fees.calculateParkingFee(60, { isFree: true }), 0);
    assert.equal(fees.calculateParkingFee(0, { isFree: true }), null);

    const now = new Date("2026-08-25T09:00:00Z");
    const request = {
      origin: { latitude: 37.5, longitude: 127.02 },
      destination: {
        id: "destination",
        name: "목적지",
        address: "서울",
        latitude: 37.501,
        longitude: 127.021,
        source: "MANUAL",
      },
      arrivalAt: "2026-08-25T09:30:00Z",
      durationMinutes: 180,
      profile: "BALANCED",
      maxWalkMinutes: 15,
    };
    const lot = (id, available, latitude = 37.501) => ({
      id,
      sourceId: id,
      source: "DEMO",
      name: id,
      address: "서울",
      latitude,
      longitude: 127.021,
      capacity: 100,
      occupiedSpaces: 100 - available,
      availableSpaces: available,
      realtimeUpdatedAt: "2026-08-25T08:56:00Z",
      realtimeSupported: true,
      feeRule: {
        isFree: false,
        baseMinutes: 10,
        baseFee: 1000,
        additionalMinutes: 10,
        additionalFee: 1000,
      },
      isOpen: true,
    });

    const ranked = recommendations.recommendParking([
      lot("a", 50),
      lot("b", 10, 37.503),
      lot("c", 2, 37.504),
      lot("d", 80, 37.52),
    ], request, [], now);
    assert.equal(ranked.length, 3);
    assert.deepEqual(ranked.map((item) => item.rank), [1, 2, 3]);
    assert.ok(ranked[0].score >= ranked[1].score);
    assert.ok(ranked[1].score >= ranked[2].score);

    const [withRoute] = recommendations.recommendParking(
      [lot("a", 50)],
      request,
      [{ parkingId: "a", driveMinutes: 7, driveDistanceMeters: 2200, source: "KAKAO_MOBILITY" }],
      now,
    );
    assert.equal(withRoute.driveMinutes, 7);
    assert.equal(withRoute.routeSource, "KAKAO_MOBILITY");
    assert.ok(withRoute.predictedAvailable.min >= 0);
    assert.ok(withRoute.predictedAvailable.max <= withRoute.capacity);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
  return "fee, ranking, route and prediction assertions";
});

await runCheck("PWA assets", async () => {
  const required = [
    "app/manifest.ts",
    "public/sw.js",
    "public/icons/icon.svg",
    "public/icons/icon-maskable.svg",
    "app/offline/page.tsx",
  ];
  for (const relative of required) {
    const absolute = path.join(root, relative);
    assert.ok(existsSync(absolute), `${relative} is missing`);
    assert.ok((await stat(absolute)).size > 0, `${relative} is empty`);
  }
  const serviceWorker = await readFile(path.join(root, "public/sw.js"), "utf8");
  for (const icon of ["/icons/icon.svg", "/icons/icon-maskable.svg"]) {
    assert.ok(serviceWorker.includes(icon), `service worker cache is missing ${icon}`);
  }
  return `${required.length} required assets and service-worker cache`;
});

await runCheck("tracked secret files", async () => {
  const tracked = execFileSync("git", ["ls-files"], { cwd: root, encoding: "utf8" }).split(/\r?\n/).filter(Boolean);
  const forbidden = tracked.filter((file) => /(^|\/)\.env(?:\.|$)/.test(file) && !file.endsWith(".env.example") && file !== ".env.example");
  const privateKeys = tracked.filter((file) => /\.(?:pem|p12|pfx|key)$/i.test(file));
  assert.deepEqual([...forbidden, ...privateKeys], [], "tracked secret-like files detected");
  return `${tracked.length} tracked files checked`;
});

await runCheck("Git whitespace validation", async () => {
  execFileSync("git", ["diff", "--check", "HEAD"], { cwd: root, stdio: "pipe" });
  return "git diff --check";
});

console.log("");
if (failures.length) {
  console.error(`Repository check failed: ${failures.length}/${checks.length + failures.length} checks failed.`);
  process.exit(1);
}
console.log(`Repository check passed: ${checks.length}/${checks.length} checks.`);
