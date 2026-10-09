# 해 뜨는 집 — Netlify 버전

친구가 "예약하기"를 누르면 → "예약이 완료되었어요!" → 바로 모두가 보는 예약자 명단에 올라가요.
명단 삭제·상태 변경은 카냐(비밀번호)만 할 수 있어요.

## 올리는 방법 (Git 방식 — 이 방법을 권장해요)
1. GitHub에서 새 저장소를 만들고 이 폴더의 파일을 전부 올려요. (`node_modules` 폴더는 올리지 마세요)
2. Netlify → Add new site → Import an existing project → 그 저장소 선택. 설정은 그대로 두고 Deploy.
3. Site configuration → Environment variables → `ADMIN_PASSWORD` 추가 (카냐만 아는 비밀번호).
4. Deploys → Trigger deploy 로 한 번 더 배포.
5. 주소(○○○.netlify.app)로 들어가 시험 예약 → 명단 확인 → 카냐 로그인 후 삭제까지 해보세요.
   Site configuration → Change site name 에서 주소를 바꿀 수 있어요.

카냐 로그인은 "예약자 명단 확인하기" 화면 아래 "카냐 전용"에서 해요.

## 알아둘 점
- 예약은 Netlify Blobs에 저장돼요. 사이트를 다시 배포해도 사라지지 않아요.
- 로그인/예약 횟수 제한은 서버가 쉬었다 깨면 초기화되는 보조 장치예요.
- 공개 명단에는 기타 사항·수영 실력이 보이지 않고, 카냐 로그인 때만 보여요.
