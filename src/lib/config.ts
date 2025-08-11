// src/lib/config.ts
import fs from "node:fs/promises";
import path from "node:path";

export type AppConfig = {
  velogUsername: string; // velog 아이디
  targetRepoUrl: string; // github.io 리포지토리 URL
  githubIoRepoPath: string; // 절대 경로
  postsDir: string; // 기본 "_posts"
  branch?: string; // 기본 "main"
  authorName?: string; // optional git user.name
  authorEmail?: string; // optional git user.email
  commitMessage?: string; // 템플릿: update {added} added, {updated} updated
};

const RC_FILENAME = ".velogsyncrc.json";

export async function loadConfig(cwd = process.cwd()): Promise<AppConfig> {
  const rcPath = path.join(cwd, RC_FILENAME);
  const raw = await fs.readFile(rcPath, "utf-8");
  return JSON.parse(raw);
}

export async function saveConfig(cfg: AppConfig, cwd = process.cwd()) {
  const rcPath = path.join(cwd, RC_FILENAME);
  await fs.writeFile(rcPath, JSON.stringify(cfg, null, 2), "utf-8");
  return rcPath;
}

export function normalizeVelogUsername(input: string): string {
  // 허용: "username" 또는 "https://velog.io/@username"
  const m = input.trim().match(/@?([\w.-]+)$/);
  if (!m) throw new Error("유효한 Velog 주소/아이디가 아님");
  return m[1]!;
}

export function normalizeRepoUrl(input: string): string {
  const t = input.trim();
  if (!/^https?:\/\//i.test(t)) {
    throw new Error(
      "HTTP(S) URL만 허용한다. 예: https://github.com/<owner>/<repo>.git"
    );
  }
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    throw new Error("유효한 URL이 아님");
  }
  if (u.hostname !== "github.com") throw new Error("github.com URL만 허용한다");
  const parts = u.pathname.replace(/^\/+/, "").split("/");
  if (parts.length < 2) throw new Error("경로가 올바르지 않음 (owner/repo)");

  // 쿼리/해시 제거
  u.search = "";
  u.hash = "";
  return u.toString();
}
