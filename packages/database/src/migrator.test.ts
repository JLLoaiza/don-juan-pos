import { createHash } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadMigrations } from "./migrator.js";

const temporaryDirectories: string[] = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe("loadMigrations", () => {
  it("loads only numbered immutable migration files in lexical order", () => {
    const directory = mkdtempSync(join(tmpdir(), "don-juan-migrations-"));
    temporaryDirectories.push(directory);
    writeFileSync(join(directory, "0010_later.sql"), "SELECT 10;");
    writeFileSync(join(directory, "0001_first.sql"), "SELECT 1;");
    writeFileSync(join(directory, "scratch.sql"), "SELECT 0;");

    const migrations = loadMigrations(directory);
    expect(migrations.map((migration) => migration.filename)).toEqual(["0001_first.sql", "0010_later.sql"]);
    expect(migrations[0]?.checksum).toBe(createHash("sha256").update("SELECT 1;").digest("hex"));
  });
});
