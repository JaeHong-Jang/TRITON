# 목재 법정과 히구루마 자산

- 날짜: 2026-10-03
- 도구: Codex 내장 `image_gen.imagegen`. CLI/API 대체 경로 미사용.
- 참고: 사용자가 제공한 전통 목재 법정 사진. 미래도시 화면은 교체 대상.
- 배경: `traditional-courtroom.png` (1536 × 1024)
- 인물: `court-character.png` (1024 × 1536, 투명 PNG)
- 원본은 Codex 생성 폴더에 유지하고 프로젝트에 복사.
- 최초에는 히구루마 본인으로 가정했으나 아래 후속 정정으로 저지맨을 사용한다. 시각 요소이며 AI가 판결하는 역할을 뜻하지 않는다.

## 현재 캐릭터: 저지맨 (2026-10-03 후속 정정)

- 사용자 요청: 히구루마 본인이 아니라 영역전개에 나오는 괴물로 교체.
- 사용 자산: `judgeman.png`, 투명 PNG. 이전 `court-character.png`는 기록으로 남기고 장면에서 참조하지 않는다.
- 도구: Codex 내장 `image_gen.imagegen`, `transparent_background: true`.
- 외형 확인: [BANDAI SPIRITS 공식 저지맨 상품 사진](https://on-line.1kuji.com/Contents/ProductImages/0/sap_0000008388_2857163_LL.jpg). 흰 봉합 눈 얼굴, 검은 삼각형 몸체, 양옆 큰 천칭과 아래 작은 천칭을 확인했다. 사진은 외형 확인용이며 제품 자산에 직접 사용하지 않았다.
- 원본: `/Users/leeseungbo/.codex/generated_images/01a0fb5f-a61c-7fd1-93b6-6ae3cc3a51ed/exec-0498b21d-6af2-4e78-91fb-76a7cb35b247.png`

### 저지맨 생성 프롬프트

Use case: illustration-story. Create a standalone transparent PNG character asset for a traditional walnut courtroom UI. Subject: exactly ONE Judgeman (ジャッジマン, 저지맨), Hiromi Higuruma's shikigami in Jujutsu Kaisen Deadly Sentencing. Depict the recognizable monstrous spirit, with a broad black shroud shaped like an inverted triangle: two very long pointed horizontal sleeve-like appendages forming the top span, and a tapered pointed lower body. A small elongated pale ivory oval mask-like face sits in the upper center within concentric dark cloth folds. The face has both eyes sewn closed with clearly visible vertical black stitches and small dark purple lips. No hair. From each horizontal appendage tip hangs a dark bronze scale pan on a thin vertical cord that splits into triangular three-point suspension; both large side pans hang at the same height. A third tiny balance pan hangs beneath the tapered bottom tip. No human hands, no feet, no legs: entirely a floating draped apparition. Full creature and all three pans visible, frontal view, almost symmetrical, neutral closed mouth. Broad floating silhouette. Style: polished Japanese anime illustration with crisp linework, detailed folded black fabric, restrained painterly shading, warm amber rim lighting from upper left to match a wood courtroom, tasteful dark brown reflected light and ivory mask. A single self-contained character cutout only. Square composition, fill 85% of canvas width, preserve a transparent margin on every edge. Genuine transparent background, no room, no floor, no background color, no text, no typography, no watermark, no UI. Do not draw Higuruma or any human, no business suit, no gavel, no robots, no additional characters, no aura, no dramatic verdict or attack.
- 배경에 사람 없음, 캐릭터 PNG 한 번만 배치. 투명 여백의 alpha=0 확인.

## 배경 프롬프트

Use case: stylized-concept. Asset type: large background for an interactive courtroom scene. Create an original traditional courtroom closely inspired by the attached reference's architecture, rich walnut panelled walls, warm brass sconces, coffered ivory ceiling, softly glowing central pendant, raised judge's bench with one empty black leather chair, small brass scales of justice wall medallion, counsel desks and a central aisle. Symmetrical frontal perspective from the gallery, generous breadth and depth. Style: richly detailed hand-painted cinematic anime background with realistic architectural perspective and subtle visible brushwork, restrained dark brown and amber palette, warm soft daylight from tall windows on the left. Make the room quietly solemn, welcoming to read, with clear legible architecture, not a horror dungeon. Composition: wide 3:2 landscape, judge's bench in upper middle, keep central foreground aisle and middle-right foreground clear for a single character overlay. Full-bleed background only, no text or UI. No people, no characters, no robots, no futuristic objects, no glass skyscrapers, no holograms, no flags, no logos, no watermark. This is a new scene based on the reference, not a UI mockup.

입력: `/var/folders/l8/8s0hmsjd3b3fzy_4n0yw3rch0000gn/T/codex-clipboard-a1f8960b-0988-4bcd-9c16-fa42088841b3.png`
원본: `/Users/leeseungbo/.codex/generated_images/01a0fb5f-a61c-7fd1-93b6-6ae3cc3a51ed/exec-4ad4282d-ec5b-4b50-88b9-86b8a5509d0e.png`

## 캐릭터 프롬프트

Use case: illustration-story. Asset type: transparent full-body character cutout for a warm traditional wood courtroom UI. Subject: exactly ONE Hiromi Higuruma from Jujutsu Kaisen, recognizable canonical appearance: adult Japanese man with short slicked-back dark black hair, distinctive long angular nose, tired serious eyes with subtle under-eye lines, clean-shaven, lean tall build, black business suit, white shirt, dark tie, black dress shoes. Standing in a calm composed pose, body in a slight three-quarter view, face looking toward the viewer, holding his small wooden judge's gavel loosely pointing downward at his side with one hand, the other hand relaxed in a trouser pocket. Expression thoughtful and neutral, not angry, no smile, no judgment being delivered. Style: polished cinematic Japanese anime character artwork, mature realistic proportions, crisp expressive linework, careful cel shading with subtle painterly depth. Warm soft light from upper left and subtle amber reflected light to match a walnut courtroom. Full body from top of hair through both shoes, centered, generous transparent margin so nothing is cut off, portrait composition. True transparent background, no floor, no scene, no text, no watermark, no extra people, no judge robes, no Judgeman spirit, no robot, no chibi, no glowing effects, no aura. Only the single character and gavel, clean natural silhouette.

원본: `/Users/leeseungbo/.codex/generated_images/01a0fb5f-a61c-7fd1-93b6-6ae3cc3a51ed/exec-de1bb901-6c5a-4f43-871f-65d04fb5a77c.png`
