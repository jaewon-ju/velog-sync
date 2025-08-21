# Velog-Sync

Velog 글을 GitHub Pages 블로그(github.io)에 자동으로 동기화해주는 도구입니다.  
Velog와 블로그를 동시에 운영하면서, 글 작성 후 별도 복사 과정 없이 Markdown 파일을 자동 생성하고 커밋/푸시까지 처리합니다.

## 기능

- Velog 포스트를 Markdown으로 변환하여 블로그에 저장
- 기존 글과 비교하여 새 글/수정 글만 자동 반영
- 이미지 다운로드 후 블로그 로컬로 저장 (Velog CDN 사용 안 함)
- Git commit & push 자동 처리
- CI 환경(GitHub Actions)에서 주기적 동기화 가능

---

## 설치

1. Velog-Sync 저장소를 클론합니다.

```bash
git clone https://github.com/jaewon-ju/velog-sync
cd velog-sync
```

<br>

2. 본인 GitHub 계정에 새 리포지토리를 생성합니다. (예: my-velog-sync)
```bash
git remote remove origin
git remote add origin https://github.com/<your-username>/my-velog-sync.git
git push -u origin main
```

<br>

3. GitHub 리포지토리 Settings → Secrets → Actions에서 GH_PAT_FOR_GHIO를 등록합니다.
```bash
이름: GH_PAT_FOR_GHIO
값: 본인 GitHub Personal Access Token
```

<br>

## 초기 설정

처음 사용할 때는 Velog 계정과 github.io 블로그 정보를 입력해야 합니다.
```
velog-sync init
```

터미널에서 차례대로 질문이 나옵니다:
- Velog 주소 또는 아이디
https://velog.io/@username 전체 주소 또는 username만 입력

- github.io 리포지토리 URL
예: https://github.com/myname/myname.github.io

- github.io 리포지토리 절대 경로
로컬에 클론한 블로그 폴더 경로
예: /Users/projects/myname.github.io

- 포스트 디렉토리 (기본값: _posts)
Markdown 포스트가 저장될 폴더. Jekyll 블로그라면 _posts 그대로 사용

- 푸시할 브랜치 (기본값: main)
블로그 저장소 기본 브랜치명

- Git author 정보 (선택사항)
커밋에 사용할 user.name과 user.email

- 커밋 메시지 템플릿 (선택사항)
커밋 메시지 커스터마이징 가능

한 번 init을 완료하면 이후부터는 sync 명령만으로 글 동기화가 가능합니다.

<br>

## 동기화
```
velog-sync sync
```

- 내 Velog 계정의 최신 글 목록 가져오기
- 기존 블로그 글과 비교하여 새 글/수정 글만 업데이트
- Markdown 파일로 _posts 디렉토리에 저장
- Git commit 및 push 자동 실행
GitHub Actions를 설정해두면, 블로그는 주기적으로 자동 동기화됩니다.
