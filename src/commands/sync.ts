import { Command } from "commander";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { createPostsQuery, createPostDetailQuery } from "../utils/graphql.js";
import { request } from "undici";
import { computeHash } from "../utils/hash.js";

/**
 * Velog 글을 백업하는 `sync` 명령어 정의
 */
const syncCommand = new Command("sync")
  .description("Fetch all posts from Velog and save them as Markdown")
  .argument("<username>", "Velog username")
  .action(async (username: string) => {
    const graphqlEndpoint = "https://v2.velog.io/graphql";

    // 📁 백업할 폴더를 현재 작업 디렉토리 기준으로 설정
    const backupDir = path.join(process.cwd(), "posts");
    await mkdir(backupDir, { recursive: true });

    console.log(`🔍 Fetching posts for @${username}...`);
    const posts: any[] = [];
    let cursor: string | null = null;

    // 📥 모든 게시글을 cursor 기반으로 페이지네이션하여 가져옴
    while (true) {
      const query = createPostsQuery(username, cursor);
      const res = await request(graphqlEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(query),
      });

      const json = (await res.body.json()) as any;
      const fetched = json.data.posts;

      if (!fetched || fetched.length === 0) break;
      posts.push(...fetched);

      // 다음 페이지 커서 설정
      if (fetched.length < 20) break;
      cursor = fetched[fetched.length - 1].id;
    }

    console.log(`✅ 총 ${posts.length}개의 게시글을 찾았습니다.`);

    // 🔄 각 게시글을 순회하며 Markdown 파일로 저장
    for (const postMeta of posts) {
      // 📑 게시글 본문 상세 내용 요청
      const detailQuery = createPostDetailQuery(username, postMeta.url_slug);
      const res = await request(graphqlEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(detailQuery),
      });
      const json = (await res.body.json()) as any;
      const post = json.data.post;

      if (!post || !post.body) {
        console.warn(`⚠️  글 "${postMeta.title}"를 가져오지 못했습니다.`);
        continue;
      }

      // 📄 파일명은 제목 기반 + 불가능한 문자 제거 + .md 확장자
      const filePath = path.join(backupDir, `${sanitize(post.title)}.md`);
      const now = new Date().toISOString();
      const hash = computeHash(post.body);

      // 🔍 이미 존재하는 파일과 해시 비교 → 변경 없으면 skip
      let shouldUpdate = true;
      try {
        const existing = await readFile(filePath, "utf-8");
        const match = existing.match(/hash:\s?"([a-f0-9]+)"/);
        if (match && match[1] === hash) {
          console.log(`⏩ ${post.title} 변경 없음 (skip)`);
          shouldUpdate = false;
        }
      } catch {
        // 파일 없으면 새로 저장
        shouldUpdate = true;
      }

      if (!shouldUpdate) continue;

      // 📋 frontmatter 작성 (YAML 형식)
      const frontmatter =
        `---\n` +
        `title: "${post.title}"\n` +
        `description: "${post.short_description.replace(/\n/g, " ")}"\n` +
        `date: ${post.released_at}\n` +
        `tags: ${JSON.stringify(post.tags)}\n` +
        `slug: "${post.url_slug}"\n` +
        (post.thumbnail ? `thumbnail: "${post.thumbnail}"\n` : "") +
        (post.series
          ? `series:\n  id: ${post.series.id}\n  name: "${post.series.name}"\n`
          : "") +
        `velogSync:\n  lastSyncedAt: ${now}\n  hash: "${hash}"\n` +
        `---\n`;

      // ✍️ 전체 콘텐츠 = frontmatter + 본문
      const fullContent = frontmatter + "\n" + post.body;
      await writeFile(filePath, fullContent, "utf-8");

      console.log(`💾 ${post.title} 저장 완료`);
    }
  });

/**
 * 파일명으로 사용할 수 없는 문자를 제거하여 안전한 이름으로 변환
 */
function sanitize(title: string): string {
  return title.replace(/[\\/:*?"<>|]/g, "").slice(0, 100);
}

export default syncCommand;
