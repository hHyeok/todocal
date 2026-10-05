#!/usr/bin/env node
// 어느 위치에서 실행해도 프로젝트 폴더 기준으로 빌드·실행한다
import { execSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const cmd = process.argv[2] ?? "up";
execSync(`pnpm ${cmd === "up" ? "up" : cmd}`, { cwd: root, stdio: "inherit" });
