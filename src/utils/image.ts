import { request } from "undici";
import { writeFile, mkdir } from "fs/promises";
import path from "path";

async function downloadImage(url: string, outputDir: string): Promise<string> {
  const filename = path.basename(url).split("?")[0] as string; // 쿼리 제거
  const outputPath = path.join(outputDir, filename);

  await mkdir(outputDir, { recursive: true });

  const res = await request(url);
  const buffer = Buffer.from(await res.body.arrayBuffer());
  await writeFile(outputPath, buffer);

  // 저장 후 리턴할 Markdown용 경로
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
