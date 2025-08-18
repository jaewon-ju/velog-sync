import { Command } from "commander";
import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "node:fs";
import path from "path";
import { createPostsQuery, createPostDetailQuery } from "../utils/graphql.js";
import { request } from "undici";
import { computeHash } from "../utils/hash.js";
import { loadConfig } from "../lib/config.js";
import { simpleGit } from "simple-git";

/**
 * Velog 글을 백업하는 `sync` 명령어 정의
 */
const syncCommand = new Command("sync")
  .description("Fetch all posts from Velog and save them as Markdown")
  .action(async () => {
    const cfg = await loadConfig().catch(() => null);

    if (!cfg) {
      throw new Error(
        "설정이 없습니다. 먼저 `velog-sync init`을 실행하거나 username을 인자로 전달하세요."
      );
    }

    const username = cfg.velogUsername;
    const graphqlEndpoint = "https://v2.velog.io/graphql";

    // ✅ github.io 리포 내 postsDir로 저장
    const repoPath = cfg.githubIoRepoPath;
    const postsRoot = path.join(repoPath, cfg.postsDir || "_posts");
    if (!existsSync(repoPath))
      throw new Error(`github.io repo 경로가 존재하지 않음: ${repoPath}`);
    await mkdir(postsRoot, { recursive: true });

    console.log(`🔍 Fetching posts for @${username}...`);
    const posts: any[] = [];
    let cursor: string | null = null;

    // 📥 모든 게시글 페이지네이션
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

    // 각 게시글 처리 → github.io/_posts/<YYYY-MM-DD-slug>.md
    for (const postMeta of posts) {
      // 상세
      const detailQuery = createPostDetailQuery(username, postMeta.url_slug);
      const res = await request(graphqlEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detailQuery),
      });
      const json = (await res.body.json()) as any;
      const post = json?.data?.post;

      if (!post || !post.body) {
        console.warn(`⚠️  글 "${postMeta.title}"를 가져오지 못했습니다.`);
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

      // ✅ Jekyll 호환 front matter 유지(필요 시 layout/date/slug 추가)
      const frontmatter =
        `---\n` +
        `title: "${post.title}"\n` +
        `description: "${post.short_description.replace(/\n/g, " ")}"\n` +
        `date: ${post.released_at}\n` +
        `tags: ${JSON.stringify(post.tags)}\n` +
        `slug: "${post.url_slug}"\n` +
        (post.thumbnail ? `thumbnail: "${post.thumbnail}"\n` : "") +
        (post.series ? `categories: ${[post.series.name]}\n` : "") +
        `velogSync:\n  lastSyncedAt: ${now}\n  hash: "${hash}"\n` +
        `---\n`;

      const fullContent = frontmatter + "\n" + post.body;
      await writeFile(filePath, fullContent, "utf-8");

      // created vs updated 간단 판정
      if (shouldUpdate) {
        if (existsSync(filePath)) updated++;
        else added++;
      }
      console.log(`💾 ${post.title} 저장 완료`);
    }

    // 🔁 git add/commit/push
    const git = simpleGit({ baseDir: repoPath });
    try {
      await git.fetch().catch(() => {});
      const branch = cfg.branch || "main";
      await git.checkout(branch).catch(() => {});
      await git.pull("origin", branch).catch(() => {});
    } catch (e) {
      console.warn("⚠️ git fetch/pull 단계에서 경고:", e);
    }

    await git.add(".");
    // 변경 여부 확인
    const status = await git.status();
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
      await git.addConfig("user.name", cfg.authorName);
      await git.addConfig("user.email", cfg.authorEmail);
    }

    const msgTmpl = cfg.commitMessage || "chore(velog-sync): sync";
    const commitMsg = msgTmpl
      .replace("{added}", String(added))
      .replace("{updated}", String(updated));

    await git.commit(commitMsg);
    await git.push("origin", cfg.branch || "main");
    console.log(`🚀 push 완료: ${commitMsg}`);
  });

function sanitize(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, "").slice(0, 100);
}

function toJekyllFilename(post: { url_slug: string; released_at: string }) {
  const d = new Date(post.released_at);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const slug = post.url_slug.replace(/[^a-z0-9\-]+/gi, "-").toLowerCase();
  return `${yyyy}-${mm}-${dd}-${slug}.md`;
}

export default syncCommand;
