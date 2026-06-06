# Avatar Gallery

GitHub Pages에 그대로 올릴 수 있는 정적 아바타 모션 갤러리입니다.

## 갤러리 갱신

아이템 폴더나 PNG를 추가/삭제한 뒤 manifest를 다시 만들려면:

```powershell
cd C:\Users\user\Desktop\Penguins\avatar-gallery
node .\tools\build-manifest.mjs
```

## GitHub Pages 업로드

새 GitHub 저장소 이름을 `avatar-gallery`로 만든 뒤, 업로드할 컴퓨터에서 이 폴더로 이동해 실행합니다.

```bash
git init
git branch -M main
git add .
git commit -m "Add avatar gallery"
git remote add origin https://github.com/miniland19/avatar-gallery.git
git push -u origin main
```

GitHub 저장소의 `Settings > Pages`에서 `Deploy from a branch`, `main`, `/root`를 선택하면 아래 주소로 열립니다.

```text
https://miniland19.github.io/avatar-gallery/
```
