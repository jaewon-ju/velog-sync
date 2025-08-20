// src/commands/init.ts (inquirer 사용 버전)
import { Command } from "commander";
import inquirer from "inquirer";
import path from "node:path";
import {
  saveConfig,
  normalizeVelogUsername,
  type AppConfig,
  normalizeRepoUrl,
} from "../lib/config.js";
import { existsSync } from "node:fs";

const initCommand = new Command("init")
  .description("Initialize velog-sync configuration")
  .action(async () => {
    console.log("🔧 velog-sync 설정을 시작합니다...\n");

    try {
      const answers = await inquirer.prompt([
        {
          type: "input",
          name: "velog",
          message: "Velog 주소 또는 아이디(@username):",
          validate: (input) => {
            if (!input || input.trim() === "") {
              return "필수 입력입니다.";
            }
            return true;
          },
          filter: (input) => input?.trim(),
        },
        {
          type: "input",
          name: "targetRepo",
          message: "github.io 리포지토리 URL:",
          validate: (input) => {
            if (!input || input.trim() === "") {
              return "필수 입력입니다.";
            }
            try {
              return (
                !!normalizeRepoUrl(input.trim()) ||
                "올바른 https URL 형태가 필요합니다."
              );
            } catch {
              return "올바른 https URL 형태가 필요합니다.";
            }
          },
          filter: (input) => input?.trim(),
        },
        {
          type: "input",
          name: "repo",
          message: "github.io 리포지토리 절대 경로:",
          validate: (input) => {
            if (!input || input.trim() === "") {
              return "필수 입력입니다.";
            }
            const trimmedPath = input.trim();
            return existsSync(trimmedPath) ? true : "경로가 존재하지 않습니다.";
          },
          filter: (input) => input?.trim(),
        },
        {
          type: "input",
          name: "postsDir",
          message: "포스트 디렉토리:",
          default: "_posts",
          validate: (input) => !!input || "필수 입력입니다.",
          filter: (input) => input?.trim() || "_posts",
        },
        {
          type: "input",
          name: "branch",
          message: "푸시할 브랜치:",
          default: "main",
          filter: (input) => input?.trim() || "main",
        },
        {
          type: "input",
          name: "authorName",
          message: "Git user.name (선택사항):",
          filter: (input) => input?.trim() || undefined,
        },
        {
          type: "input",
          name: "authorEmail",
          message: "Git user.email (선택사항):",
          filter: (input) => input?.trim() || undefined,
        },
        {
          type: "input",
          name: "commitMessage",
          message: "커밋 메시지:",
          default: "velog-sync: synchronized",
          filter: (input) => input?.trim() || "velog-sync: synchronized",
        },
      ]);

      const cfg: AppConfig = {
        velogUsername: normalizeVelogUsername(answers.velog),
        targetRepoUrl: normalizeRepoUrl(answers.targetRepo),
        githubIoRepoPath: path.resolve(answers.repo),
        postsDir: answers.postsDir,
        branch: answers.branch,
        authorName: answers.authorName,
        authorEmail: answers.authorEmail,
        commitMessage: answers.commitMessage,
      };

      const saved = await saveConfig(cfg);
      console.log(`\n✅ 설정이 성공적으로 저장되었습니다: ${saved}`);
      console.log(
        `   이제 'velog-sync sync' 명령을 실행하면 자동으로 업로드/푸시됩니다.`
      );
    } catch (error: any) {
      if (error.isTtyError) {
        console.error("\n❌ 이 환경에서는 대화형 입력을 지원하지 않습니다.");
        console.error(
          "   설정 파일을 직접 생성하거나 다른 터미널을 사용해보세요."
        );
      } else {
        console.error("\n❌ 설정 중 오류가 발생했습니다:", error);
      }
      process.exit(1);
    }
  });

export default initCommand;
