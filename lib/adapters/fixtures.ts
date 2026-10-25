import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";

const DIR = path.join(process.cwd(), "lib", "adapters", "__fixtures__");

/** Reads a saved vendor response from __fixtures__; returns null if there is no sample for it. */
export async function readFixture<T = unknown>(name: string): Promise<T | null> {
  try {
    return JSON.parse(await readFile(path.join(DIR, `${name}.json`), "utf8")) as T;
  } catch {
    return null;
  }
}
