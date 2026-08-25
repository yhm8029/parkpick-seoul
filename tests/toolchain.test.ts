import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);

describe("TypeScript toolchain pinning", () => {
  it("uses TypeScript 6.0.3 exactly", () => {
    const ts = require("typescript");
    expect(ts.version).toBe("6.0.3");
  });

  it("exposes ScriptTarget.ES2022 and ModuleKind.ES2022 with Bundler resolution", () => {
    const ts = require("typescript");
    expect(ts.ScriptTarget?.ES2022).toBeDefined();
    expect(ts.ModuleKind?.ES2022).toBeDefined();
    expect(ts.ModuleResolutionKind?.Bundler).toBeDefined();
  });
});

describe("scripts/check-repo.mjs", () => {
  it("runs to completion and reports 9/9 checks passing", () => {
    const scriptPath = path.resolve(process.cwd(), "scripts/check-repo.mjs");
    expect(existsSync(scriptPath)).toBe(true);

    const result = spawnSync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Repository check passed: 9/9 checks.");
  });

  it("fails closed with the npm ci guidance when project-local TypeScript is not loadable", () => {
    const scriptPath = path.resolve(process.cwd(), "scripts/check-repo.mjs");
    expect(existsSync(scriptPath)).toBe(true);

    const tempDir = mkdtempSync(path.join(tmpdir(), "parkpick-toolchain-"));
    const preloadPath = path.join(tempDir, "block-typescript.cjs");
    try {
      writeFileSync(
        preloadPath,
        "const Module = require('node:module');\n" +
          "const originalLoad = Module._load;\n" +
          "Module._load = function patchedLoad(request, parent, isMain) {\n" +
          "  if (request === 'typescript') {\n" +
          "    throw new Error('BLOCKED_TYPESCRIPT_SENTINEL');\n" +
          "  }\n" +
          "  return originalLoad.call(this, request, parent, isMain);\n" +
          "};\n",
        "utf8",
      );

      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, NODE_OPTIONS: `--require=${preloadPath}` },
      });

      const expected = "TypeScript is unavailable or incompatible. Run npm ci first.";
      const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
      expect(result.status).not.toBe(0);
      expect(combined).toContain(expected);
      expect(combined).not.toContain("BLOCKED_TYPESCRIPT_SENTINEL");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }

    const followUp = spawnSync(process.execPath, [scriptPath], {
      cwd: process.cwd(),
      encoding: "utf8",
    });
    expect(followUp.status).toBe(0);
  });
});
