# CleanShot 피벗 — 진행 상황 스냅샷

> **마지막 업데이트:** 2026-04-21
> **목적:** Windows 터미널 응답없음 등으로 세션이 튕겼을 때, 사용자와 AI 모두 어디까지 진행했는지 즉시 회복하기 위한 체크포인트.
> **재개 시 첫 행동:** 이 파일을 먼저 읽고, 그 다음 `TaskList`로 작업 상태 확인, 마지막으로 `git status`로 워킹 트리 확인.

---

## 1. 큰 그림 (피벗 컨셉)

CleanShot for YouTube를 도네이션 무료 도구에서 **풀 페이드 SaaS**로 피벗 중.

**한 줄:** YouTube 영상 → 발행 가능한 LinkedIn 캐러셀(이미지 10장 + 카피 + 해시태그) 30초 내 자동 생성.

**가격:** Creator $19/mo (영상 30편), Pro $49/mo (무제한 + 브랜드 보이스 + 1-Click Publish).

**Free Trial:** 영상 1편 평생.

이름의 *shot*을 screenshot에서 *one-shot deliverable*로 의미 전환. 이름만 유지, 솔루션은 완전 재설계.

---

## 2. 확정된 결정 사항 (모두 메모리에 저장됨)

| # | 결정 | 메모리 파일 |
|---|---|---|
| 1 | 타깃: LinkedIn 고스트라이터/B2B 마케터 | `pivot_target_persona.md` |
| 2 | 백엔드: Cloudflare Workers + D1 + R2 | `pivot_backend_stack.md` |
| 3 | AI: Claude Haiku + Sonnet 라우팅 | `pivot_ai_model.md` |
| 4 | Free Trial: 영상 1편 평생 | `pivot_free_trial.md` |
| 5 | 기존 무료 사용자: 그냥 유료 전환 | `pivot_legacy_users.md` |
| 6 | 결제: **LemonSqueezy** (Stripe ❌, 한국 정산 우회) | `pivot_payment_provider.md` |
| 7 | 빌드 순서: C → A → B (Transcript PoC 먼저) | `pivot_build_order.md` |
| 8 | 도메인·OAuth Client ID: 사용자 직접 셋업, 가이드 보류 | `pivot_pending_setup.md` |
| 9 | (발견) LemonSqueezy 스토어 이미 존재 | `pivot_lemonsqueezy_store.md` |

---

## 3. 현재 빌드 상태

### 디렉터리 구조 (Phase 0 — 디렉터리 이동 완료)
```
DwCanvas/
├── PROGRESS.md                    ← 이 파일 (NEW)
├── privacy-policy.md              (루트 유지)
├── extension/                     ← 신규 (모든 확장 파일 이동됨)
│   ├── manifest.json              (M, PoC content_script 등록 완료)
│   ├── background.js
│   ├── content.js
│   ├── sidepanel.html             (M)
│   ├── sidepanel.js
│   ├── icons/{16,48,128}.png
│   └── poc/
│       └── transcript-poc.js      ← 신규 (Phase C PoC, untracked)
└── backend/                       ← 아직 없음 (Phase A에서 생성 예정)
```

### Git 상태 (체크포인트 시점)
```
Branch: main (origin/main 동기화됨, push 없음)

Staged (rename only):
  background.js     -> extension/background.js
  content.js        -> extension/content.js
  manifest.json     -> extension/manifest.json
  sidepanel.html    -> extension/sidepanel.html
  sidepanel.js      -> extension/sidepanel.js
  icons/icon16.png  -> extension/icons/icon16.png
  icons/icon48.png  -> extension/icons/icon48.png
  icons/icon128.png -> extension/icons/icon128.png

Unstaged (이전 작업의 working tree 변경):
  modified: extension/manifest.json
    - "version": "1.0.6" -> "1.0.7"
    - content_scripts에 poc/transcript-poc.js 추가 (world: MAIN)
  modified: extension/sidepanel.html
    - LemonSqueezy checkout URL -> buymeacoffee URL (사용자가 되돌림)

Untracked:
  extension/poc/   ← transcript-poc.js
```

**아직 commit 안 됨.** 사용자가 Q1(rename-only commit 분리 여부) 답한 뒤 commit 진행 예정.

---

## 4. 현재 단계 — Phase C: Transcript Extraction PoC

**상태:** 사용자 테스트 대기 중 (Task #3 = in_progress).

**무엇을 검증하나:**
YouTube 영상에서 자막을 **사용자 브라우저 컨텍스트**로 안정적으로 추출 가능한지. 가능하면 Cloudflare Workers의 IP 차단 문제를 우회 가능 → Phase A의 transcript 서비스 전체가 클라이언트 측으로 갈 수 있음.

**핵심 기술적 결정 — `world: MAIN`:**
PoC는 일반 content script로 isolated world에 들어가면 `window.ytInitialPlayerResponse`에 접근 못 함. Manifest V3의 `"world": "MAIN"`을 명시해 페이지 메인 월드에서 실행되도록 했음.

**PoC 파일:** `extension/poc/transcript-poc.js`
- 페이지 로드 시 자동 실행 + SPA 네비게이션(yt-navigate-finish) 시 재실행
- `window.__cleanshotExtractTranscript()` 함수도 노출 (수동 호출 가능)
- 결과는 콘솔에 `[CleanShot PoC]` 태그로 자동 로깅
- 전체 transcript는 `window.__cleanshotLastTranscript`에 저장

**Manifest 등록:**
```json
{
  "matches": ["*://*.youtube.com/watch*"],
  "js": ["poc/transcript-poc.js"],
  "world": "MAIN",
  "run_at": "document_idle"
}
```

---

## 5. 사용자 액션 — 다음에 해야 할 일

### Step 1: 확장 새로 로드
1. Chrome → `chrome://extensions/` → 우측 상단 *Developer mode* ON
2. 기존 CleanShot 확장 *Remove*
3. *Load unpacked* → `C:\Users\kms\DwCanvas\extension` 선택
4. **새 확장 ID 메모** (나중에 OAuth 셋업 때 필요)

### Step 2: 영상 10~15개 테스트
다양한 카테고리로 골고루:
- [ ] 영어 비즈니스/팟캐스트 (메인 타깃)
- [ ] 한국어 영상
- [ ] 자동생성 자막만 있는 영상
- [ ] 자막 OFF인 영상
- [ ] YouTube Shorts
- [ ] 음악 영상
- [ ] 라이브 스트림 아카이브
- [ ] 매우 긴 영상 (1시간+)

각 영상에서 F12 콘솔 열고 자동 로그 확인:
```
[CleanShot PoC] (initial) {videoId, title, ok, tracks, picked, segs, chars, err}
```

### Step 3: 결과 공유
- A안: 콘솔 우클릭 → *Save as...* → `poc-results.log` 저장 후 공유
- B안: 각 영상에서 `await window.__cleanshotExtractTranscript()` 실행 결과 복사

### Step 4 (선택): 자막 1편 깊이 검증
영어 영상 1편에서:
```js
const t = window.__cleanshotLastTranscript;
console.log('총 세그먼트:', t.length);
console.log('첫 10개:', t.slice(0, 10));
console.log('마지막 시점:', t[t.length-1].t, '초');
```

---

## 6. 펜딩 질문 (사용자 답변 대기)

**Q1.** Staged된 rename 8개를 **rename-only commit**으로 먼저 만들고, PoC + manifest 수정은 별도 commit으로? 아니면 통째로 한 commit?

**Q2.** Working tree의 `sidepanel.html` 변경 — LemonSqueezy URL → buymeacoffee로 되돌리신 게 의도였나? Phase B에서 도네이션 버튼 자체 제거 예정이지만 의도 확인용.

**Q3.** `manifest.json` version 1.0.6 → 1.0.7 — Chrome Web Store 재게시 의도였나? 피벗 후에는 v2.0.0으로 점프하는 게 자연스러움.

---

## 7. PoC 결과로 판단할 것

| 가용률 | 판단 |
|---|---|
| ≥ 80% | ✅ Go — Phase A 진입, transcript 서비스 클라이언트 추출 구조 확정 |
| 50~80% | ⚠️ Conditional Go — Whisper fallback 포함, 마진 재계산 |
| < 50% | ❌ No-go — 전체 솔루션 컨셉 재검토 |

추가 측정: 언어 커버리지, 매뉴얼 vs ASR 비율, 세그먼트 품질, 에러 패턴.

---

## 8. Phase 로드맵 (전체)

- [x] **Phase 0** — 디렉터리 정리 (extension/ 이동, poc/ 추가)
- [x] **Phase C** — Transcript PoC ✅ Go (rapid-seek + DOM 캡션 읽기로 확정)
- [x] **Phase A** — Backend Skeleton ✅ (Workers + D1 + R2 + LemonSqueezy + Auth)
- [x] **Phase B** — Extension UI Refactor ✅ (Pro-quality One-Shot UI)
- [x] **Phase 2** — AI Integration ✅ (Haiku insights + Sonnet carousel)
- [x] **Phase 3** — 프로덕션 배포 ✅ (AI Gateway, Google OAuth, JWT, FREE_LAUNCH 모드)
- [x] **템플릿** — 3개 슬라이드 디자인 + PDF + ZIP + How-to-post 가이드
- [x] **Hook 변형** — 3종 AI 제안 → 사용자 선택
- [x] **Brand Identity** — Settings 모달 (이름/핸들/색상/템플릿)
- [x] **Library** — 검색/즐겨찾기/삭제/호버 액션
- [x] **Capture 탭** — 기존 스크린샷/타임스탬프 기능 복원
- [x] **에러 가이드** — 14개 에러 코드별 원인+해결책 3단 구조
- [x] **랜딩페이지** — 다크 테마 + 법률 페이지 3종 (GitHub Pages)
- [x] **Chrome Web Store v2.0 게시 제출** (2026-04-17)
- [x] **LemonSqueezy 추가 자료 회신** (데모영상+SNS+상세설명, 2026-04-17)
- [x] **GitHub push** (v2.0 커밋, add8aec)
- [x] **CWS v2.0 심사 통과** (2026-04-20)
- [x] **LemonSqueezy 스토어 활성화** (2026-04-20)
- [x] **v2.1: Brand Voice (Pro 차별화)** — DB migration 0004, voice routes, Haiku 추출, carousel prompt 주입, Settings UI
- [x] **랜딩 Pro/Creator 카피 정직화** — 1-click publish/API access 제거, Brand Voice 강조
- [x] **Launch banner → Upgrade banner** — 유료 전환 준비 (Free trial used / Creator quota / Creator→Pro upsell)
- [x] **v2.1.0 zip 빌드** (cleanshot-v2.1.0.zip, Python forward-slash 보장)
- [ ] **Phase 6 남은 작업** — API 키 rotation, LS Webhook, FREE_LAUNCH off, CWS v2.1 업로드
- [ ] **Phase 3** — Paywall ON, Free Trial 1편 enforcement, LS Checkout
- [ ] **Phase 4** — Library + Lock-in (R2 영구 저장, 시맨틱 검색)
- [ ] **Phase 5** — Brand Voice + 1-Click Publish (Pro 기능)
- [ ] **Phase 6** — Distribution (Product Hunt, affiliate)

---

## 9. 재개 절차 (세션 튕겼을 때)

**사용자:**
1. 이 `PROGRESS.md` 열어 전체 컨텍스트 확인
2. AI에게 "이어서 가자" 또는 "PROGRESS.md 읽고 이어서" 명령

**AI:**
1. `PROGRESS.md` 읽기
2. `memory/MEMORY.md` 인덱스 읽기
3. 관련 메모리 파일 (특히 `session_checkpoint.md`) 읽기
4. `TaskList`로 작업 상태 확인
5. `git status`로 워킹 트리 확인
6. 사용자에게 "Phase C 사용자 테스트 단계에서 멈췄음. PoC 결과 있으신가요?" 같은 식으로 정확한 지점 제시
