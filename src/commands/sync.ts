import { Command } from "commander";
import { mkdir, writeFile, readFile } from "fs/promises";
import { existsSync } from "node:fs";
import path from "path";
import { createPostsQuery, createPostDetailQuery } from "../utils/graphql.js";
import { request } from "undici";
import { computeHash } from "../utils/hash.js";
import { loadConfig } from "../lib/config.js";
import { simpleGit } from "simple-git";
import { downloadImage, replaceVelogImages } from "../utils/image.js";

/**
 * Velog 글을 백업하는 통합 `sync` 명령어
 * - 로컬 환경: repoPath 사용
 * - CI 환경: targetRepoUrl + GH_PAT 사용
 *
 * CI 환경에서 --ci 옵션 사용 시:
 * 1. targetRepoUrl로 repo clone
 * 2. GH_PAT를 사용해 인증
 * 3. 임시 폴더에서 작업 후 push
 */
const syncCommand = new Command("sync")
  .description("Fetch all posts from Velog and save them as Markdown")
  .option("--ci", "Run in CI mode (GitHub Actions)") // CI 환경에서 실행 여부 옵션
  .action(async (opts) => {
    // 1️⃣ 설정 로드
    const cfg = await loadConfig().catch(() => null);
    if (!cfg) throw new Error("설정이 없습니다. 먼저 `velog-sync init` 실행");

    const username = cfg.velogUsername; // Velog username
    const graphqlEndpoint = "https://v2.velog.io/graphql"; // Velog GraphQL API

    let repoPath: string; // GitHub Pages 저장소 경로
    let git: ReturnType<typeof simpleGit>; // simple-git 인스턴스

    // 2️⃣ CI 모드 여부 체크
    if (opts.ci) {
      if (!cfg.targetRepoUrl)
        throw new Error("targetRepoUrl이 설정되어 있지 않습니다.");

      const token = process.env.GH_PAT_FOR_GHIO;
      if (!token)
        throw new Error("환경변수 GH_PAT_FOR_GHIO가 설정되어 있지 않습니다.");

      // GitHub token을 URL에 주입
      const authedUrl = injectTokenToRepoUrl(cfg.targetRepoUrl, token);

      repoPath = path.resolve(process.cwd(), "github-io-repo"); // 임시 폴더
      git = simpleGit();

      console.log(`📦 Cloning target repo: ${cfg.targetRepoUrl}`);
      await git.clone(authedUrl, repoPath); // repo clone
      git = simpleGit({ baseDir: repoPath }); // clone된 경로로 git 인스턴스 변경
    } else {
      // 로컬 환경: 기존 github.io 경로 사용
      repoPath = cfg.githubIoRepoPath;
      if (!existsSync(repoPath))
        throw new Error(`github.io repo 경로가 존재하지 않음: ${repoPath}`);
      git = simpleGit({ baseDir: repoPath });
    }

    // 3️⃣ 저장할 폴더 생성 (_posts 및 assets/posts)
    const postsRoot = path.join(repoPath, cfg.postsDir || "_posts");
    await mkdir(postsRoot, { recursive: true });

    const assetsDir = path.join(repoPath, "assets/posts");
    await mkdir(assetsDir, { recursive: true });

    console.log(`🔍 Fetching posts for @${username}...`);

    // 4️⃣ Velog 글 가져오기
    const posts: any[] = [];
    let cursor: string | null = null;

    // 페이지네이션 반복: 20개씩 가져오기
    while (true) {
      const query = createPostsQuery(username, cursor);
      const res = await request(graphqlEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });
      const json = (await res.body.json()) as any;
      const fetched = json?.data?.posts;

      if (!fetched || fetched.length === 0) break; // 더 이상 글 없음
      posts.push(...fetched);

      if (fetched.length < 20) break; // 마지막 페이지
      cursor = fetched[fetched.length - 1].id; // 다음 페이지 cursor
    }

    console.log(`✅ 총 ${posts.length}개의 게시글을 찾았습니다.`);

    // 5️⃣ 글 저장 상태 카운터
    let added = 0,
      updated = 0,
      skipped = 0;

    // 6️⃣ 각 글 상세 정보 가져오기 & Markdown 저장
    for (const postMeta of posts) {
      // 상세 쿼리
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

      // 이미지 로컬 다운로드 & 경로 치환
      let postBody = await replaceVelogImages(post.body, assetsDir);

      const filePath = path.join(postsRoot, toJekyllFilename(postMeta));
      const now = new Date().toISOString();
      const hash = computeHash(post.body); // 내용 변경 감지용 hash

      // 7️⃣ 기존 파일 비교 (변경 없으면 skip)
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
        shouldUpdate = true; // 파일 없으면 새로 생성
      }
      if (!shouldUpdate) continue;

      // 8️⃣ Jekyll 호환 front matter 작성
      const frontmatter =
        `---\n` +
        `title: "${post.title}"\n` +
        `description: "${post.short_description.replace(/\n/g, " ")}"\n` +
        `date: ${post.released_at}\n` +
        `tags: ${JSON.stringify(post.tags)}\n` +
        `slug: "${post.url_slug}"\n` +
        (post.thumbnail
          ? post.thumbnail.includes("velcdn.com")
            ? `thumbnail: "${await downloadImage(post.thumbnail, assetsDir)}"\n`
            : `thumbnail: "${post.thumbnail}"\n`
          : "") +
        (post.series ? `categories: ${[post.series.name]}\n` : "") +
        `toc: true\n` +
        `velogSync:\n  lastSyncedAt: ${now}\n  hash: "${hash}"\n` +
        `---\n`;

      // 9️⃣ Markdown 파일 저장
      await writeFile(filePath, frontmatter + "\n" + postBody, "utf-8");

      // 상태 업데이트
      if (existsSync(filePath)) updated++;
      else added++;

      console.log(`💾 ${post.title} 저장 완료`);
    }

    // Git commit & push
    try {
      await git.fetch().catch(() => {});
      const branch = cfg.branch || "main";
      await git.checkout(branch).catch(() => {});
      await git.pull("origin", branch).catch(() => {});
    } catch (e) {
      console.warn("⚠️ git fetch/pull 단계에서 경고:", e);
    }

    await git.add(".");

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

    // Git 사용자 설정
    if (cfg.authorName && cfg.authorEmail) {
      await git.addConfig("user.name", cfg.authorName);
      await git.addConfig("user.email", cfg.authorEmail);
    } else if (opts.ci) {
      // CI 기본값
      await git.addConfig("user.name", "github-actions[bot]");
      await git.addConfig(
        "user.email",
        "github-actions[bot]@users.noreply.github.com"
      );
    }

    const msgTmpl = cfg.commitMessage || "chore(velog-sync): sync";
    const commitMsg = msgTmpl
      .replace("{added}", String(added))
      .replace("{updated}", String(updated));

    await git.commit(commitMsg);
    await git.push("origin", cfg.branch || "main");
    console.log(`🚀 push 완료: ${commitMsg}`);
  });

/**
 * GitHub 토큰을 URL에 주입하여 인증용 URL 생성
 */
function injectTokenToRepoUrl(repoUrl: string, token: string) {
  const url = new URL(repoUrl);
  url.username = "x-access-token";
  url.password = token;
  return url.toString();
}

/**
 * Jekyll 호환 파일명 생성 (YYYY-MM-DD-slug.md)
 */
function toJekyllFilename(post: { url_slug: string; released_at: string }) {
  const d = new Date(post.released_at);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  const slug = post.url_slug.replace(/[^a-z0-9\-]+/gi, "-").toLowerCase();
  return `${yyyy}-${mm}-${dd}-${slug}.md`;
}

export default syncCommand;
