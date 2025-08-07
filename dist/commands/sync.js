import { Command } from "commander";
import { mkdir, writeFile, readFile } from "fs/promises";
import path from "path";
import { createPostsQuery, createPostDetailQuery } from "../utils/graphql.js";
import { request } from "undici";
import { computeHash } from "../utils/hash.js";
const syncCommand = new Command("sync")
    .description("Fetch all posts from Velog and save them as HTML (for now)")
    .argument("<username>", "Velog username")
    .action(async (username) => {
    const graphqlEndpoint = "https://v2.velog.io/graphql";
    const backupDir = path.join(process.cwd(), "backup", "html");
    await mkdir(backupDir, { recursive: true });
    console.log(`🔍 Fetching posts for @${username}...`);
    const posts = [];
    let cursor = null;
    while (true) {
        const query = createPostsQuery(username, cursor);
        const res = await request(graphqlEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(query),
        });
        const json = (await res.body.json());
        const fetched = json.data.posts;
        if (!fetched || fetched.length === 0)
            break;
        posts.push(...fetched);
        if (fetched.length < 20)
            break;
        cursor = fetched[fetched.length - 1].id;
    }
    console.log(`✅ 총 ${posts.length}개의 게시글을 찾았습니다.`);
    for (const postMeta of posts) {
        const detailQuery = createPostDetailQuery(username, postMeta.url_slug);
        const res = await request(graphqlEndpoint, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(detailQuery),
        });
        const json = (await res.body.json());
        const post = json.data.post;
        if (!post || !post.body) {
            console.warn(`⚠️  글 "${postMeta.title}"를 가져오지 못했습니다.`);
            continue;
        }
        const filePath = path.join(backupDir, `${sanitize(post.title)}.html`);
        const now = new Date().toISOString();
        const hash = computeHash(post.body);
        // ✅ 이미 존재하는 파일이라면 hash 비교
        let shouldUpdate = true;
        try {
            const existing = await readFile(filePath, "utf-8");
            const match = existing.match(/hash:\s?"([a-f0-9]+)"/);
            if (match && match[1] === hash) {
                console.log(`⏩ ${post.title} 변경 없음 (skip)`);
                shouldUpdate = false;
            }
        }
        catch {
            // 파일이 없으면 새로 저장
            shouldUpdate = true;
        }
        if (!shouldUpdate)
            continue;
        const frontmatter = `---\n` +
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
        const fullContent = frontmatter + "\n" + post.body;
        await writeFile(filePath, fullContent, "utf-8");
        console.log(`💾 ${post.title} 저장 완료`);
    }
});
function sanitize(title) {
    return title.replace(/[\\/:*?"<>|]/g, "").slice(0, 100);
}
export default syncCommand;
//# sourceMappingURL=sync.js.map