import { request } from "undici";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import { computeHash } from "./hash.js";

async function downloadImage(url: string, outputDir: string): Promise<string> {
  const ext = path.extname(url).split("?")[0] || ".jpg"; // 확장자 추출
  const hash = computeHash(url); // URL 기반 hash
  const filename = `${hash}${ext}`;
  const outputPath = path.join(outputDir, filename);

  await mkdir(outputDir, { recursive: true });

  const res = await request(url);
  const buffer = Buffer.from(await res.body.arrayBuffer());
  await writeFile(outputPath, buffer);

  // Markdown에서 참조할 경로 반환
  return `/assets/posts/${filename}`;
}

async function replaceVelogImages(markdown: string, assetsDir: string) {
  const imgRegex = /!\[.*?\]\((https?:\/\/velog\.velcdn\.com\/[^\)]+)\)/g;
  let match;
  let result = markdown;

  const promises: Promise<void>[] = [];

  while ((match = imgRegex.exec(markdown)) !== null) {
    const url = match[1] as string;
    promises.push(
      (async () => {
        const localUrl = await downloadImage(url, assetsDir);
        result = result.replace(url, localUrl);
      })()
    );
  }

  await Promise.all(promises);
  return result;
}

export { replaceVelogImages, downloadImage };
