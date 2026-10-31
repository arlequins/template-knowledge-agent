import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Readable, Writable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { test } from "node:test";

const requireDatabase = createRequire(
  new URL("../packages/db-backbone/package.json", import.meta.url),
);
const requirePostgres = createRequire(
  requireDatabase.resolve("@testcontainers/postgresql"),
);
const requireContainers = createRequire(
  requirePostgres.resolve("testcontainers"),
);
const createArchive = requireContainers("archiver");
const requireArchive = createRequire(requireContainers.resolve("archiver"));
const archiveUtils = requireArchive("archiver-utils");
const tar = requireArchive("tar-stream");

test("container archives preserve glob selection and file contents", {
  timeout: 10_000,
}, async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "dependency-archive-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await mkdir(join(directory, "nested"));
  await mkdir(join(directory, "ignored"));
  const expected = {
    "nested/child.json": '{"ok":true}',
    "space name.txt": "spaces remain intact",
    "top.txt": "top-level contents",
  };
  for (const [name, contents] of Object.entries({
    ...expected,
    ".hidden.txt": "hidden",
    "ignored/excluded.txt": "excluded",
  })) {
    await writeFile(join(directory, name), contents);
  }

  assert.deepEqual(
    archiveUtils.file
      .expand({ cwd: directory, filter: "isFile" }, [
        "**/*.{txt,json}",
        "!ignored/**",
      ])
      .sort(),
    Object.keys(expected).sort(),
  );

  const archive = createArchive("tar");
  const chunks = [];
  const collected = pipeline(
    archive,
    new Writable({
      write(chunk, _encoding, done) {
        chunks.push(Buffer.from(chunk));
        done();
      },
    }),
  );
  archive.glob("**/*.{txt,json}", {
    cwd: directory,
    ignore: ["ignored/**"],
    nodir: true,
  });
  await Promise.all([collected, archive.finalize()]);

  const extract = tar.extract();
  const entries = new Map();
  extract.on("entry", (header, stream, next) => {
    const content = [];
    stream.on("data", (chunk) => content.push(chunk));
    stream.on("end", () => {
      if (header.type === "file") {
        entries.set(header.name, Buffer.concat(content).toString("utf8"));
      }
      next();
    });
  });
  await pipeline(Readable.from([Buffer.concat(chunks)]), extract);
  assert.deepEqual(Object.fromEntries(entries), expected);
});
