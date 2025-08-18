import { Command } from "commander";
import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { request } from "undici";
import { simpleGit } from "simple-git";
import { createPostsQuery, createPostDetailQuery } from "../utils/graphql.js";
import { computeHash } from "../utils/hash.js";
import { loadConfig } from "../lib/config.js";

// github action에서만 사용하는 명령어
const syncCiCommand = new Command("sync-ci")
  .description("Fetch Velog posts and sync to github.io repo (CI mode)")
  .action(async () => {
    const cfg = await loadConfig().catch(() => null);

    if (!cfg) {
      throw new Error("설정이 없습니다. 먼저 `velog-sync init`을 실행하세요.");
    }
    if (!cfg.targetRepoUrl) {
      throw new Error("targetRepoUrl이 설정되어 있지 않습니다.");
    }

    const token = process.env.GH_PAT_FOR_GHIO;
    if (!token) {
      throw new Error("환경변수 GH_PAT_FOR_GHIO 가 설정되어 있지 않습니다.");
    }

    // 토큰이 포함된 URL로 변환
    const authedUrl = injectTokenToRepoUrl(cfg.targetRepoUrl, token);

    const username = cfg.velogUsername;
    const graphqlEndpoint = "https://v2.velog.io/graphql";

    // CI 임시 작업 디렉토리
    const workDir = path.resolve(process.cwd(), "github-io-repo");
    const git = simpleGit();

    console.log(`📦 Cloning target repo: ${cfg.targetRepoUrl}`);
    await git.clone(authedUrl, workDir);
    const repoGit = simpleGit({ baseDir: workDir });

    const postsRoot = path.join(workDir, cfg.postsDir || "_posts");
    await mkdir(postsRoot, { recursive: true });

    console.log(`🔍 Fetching posts for @${username}...`);
    const posts: any[] = [];
    let cursor: string | null = null;

    // 모든 게시글 페이지네이션
    while (true) {
      const query = createPostsQuery(username, cursor);
      const res = await request(graphqlEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });
      const json = (await res.body.json()) as any;
      const fetched = json?.data?.posts;
      if (!fetched || fetched.length === 0) break;

      posts.push(...fetched);
      if (fetched.length < 20) break;
      cursor = fetched[fetched.length - 1].id;
    }

    console.log(`✅ 총 ${posts.length}개의 게시글을 찾았습니다.`);

    let added = 0,
      updated = 0,
      skipped = 0;

    for (const postMeta of posts) {
      const detailQuery = createPostDetailQuery(username, postMeta.url_slug);
      const res = await request(graphqlEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detailQuery),
      });
      const json = (await res.body.json()) as any;
      const post = json?.data?.post;

      if (!post || !post.body) {
        console.warn(`⚠️ 글 "${postMeta.title}"를 가져오지 못했습니다.`);
        continue;
      }

      const filePath = path.join(postsRoot, toJekyllFilename(postMeta));
      const now = new Date().toISOString();
      const hash = computeHash(post.body);

      let shouldUpdate = true;
      try {
        const existing = await readFile(filePath, "utf-8");
        const match = existing.match(/hash:\s?"([a-f0-9]+)"/);
        if (match && match[1] === hash) {
          console.log(`⏩ ${post.title} 변경 없음 (skip)`);
          shouldUpdate = false;
          skipped++;
        }
      } catch {
        shouldUpdate = true;
      }

      if (!shouldUpdate) continue;

      const frontmatter =
        `---\n` +
        `title: "${post.title}"\n` +
        `description: "${post.short_description.replace(/\n/g, " ")}"\n` +
        `date: ${post.released_at}\n` +
        `tags: ${JSON.stringify(post.tags)}\n` +
        `toc: true\n` +
        `slug: "${post.url_slug}"\n` +
        (post.thumbnail ? `thumbnail: "${post.thumbnail}"\n` : "") +
        (post.series ? `categories: ${[post.series.name]}\n` : "") +
        `velogSync:\n  lastSyncedAt: ${now}\n  hash: "${hash}"\n` +
        `---\n`;

      await writeFile(filePath, frontmatter + "\n" + post.body, "utf-8");

      if (existsSync(filePath)) updated++;
      else added++;

      console.log(`💾 ${post.title} 저장 완료`);
    }

    // git commit & push
    await repoGit.fetch().catch(() => {});
    await repoGit.checkout(cfg.branch || "main").catch(() => {});
    await repoGit.pull("origin", cfg.branch || "main").catch(() => {});

    await repoGit.add(".");
    const status = await repoGit.status();
    const nothingToCommit =
      status.created.length === 0 &&
      status.modified.length === 0 &&
      status.renamed.length === 0 &&
      status.deleted.length === 0 &&
      status.staged.length === 0;

    if (nothingToCommit) {
      console.log("✅ 변경 사항 없음. 커밋/푸시 생략.");
      return;
    }

    if (cfg.authorName && cfg.authorEmail) {
      await repoGit.addConfig("user.name", cfg.authorName);
      await repoGit.addConfig("user.email", cfg.authorEmail);
    } else {
      // 기본값 설정
      await repoGit.addConfig("user.name", "github-actions[bot]");
      await repoGit.addConfig(
        "user.email",
        "github-actions[bot]@users.noreply.github.com"
      );
    }

    const commitMsg = (cfg.commitMessage || "chore(velog-sync): sync")
      .replace("{added}", String(added))
      .replace("{updated}", String(updated));

    await repoGit.commit(commitMsg);
    await repoGit.push("origin", cfg.branch || "main");
    console.log(`🚀 push 완료: ${commitMsg}`);
  });

function injectTokenToRepoUrl(repoUrl: string, token: string) {
  const url = new URL(repoUrl);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}

function toJekyllFilename(post: { url_slug: string; released_at: string }) {
  const d = new Date(post.released_at);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const slug = post.url_slug.replace(/[^a-z0-9\-]+/gi, "-").toLowerCase();
  return `${yyyy}-${mm}-${dd}-${slug}.md`;
}

export default syncCiCommand;
