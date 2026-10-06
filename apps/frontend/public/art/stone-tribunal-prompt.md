# 석조 원형 법정과 3D 저지맨 자산

- 날짜: 2026-10-03. 사용자가 승인한 석조 원형 법정 시안을 배경과 캐릭터로 분리.
- 도구: Codex 내장 `image_gen.imagegen`. 배경은 불투명, 캐릭터는 `transparent_background: true`.
- 프로젝트 자산: `stone-tribunal.png`, `judgeman-3d.png`.
- 승인 시안: `/Users/leeseungbo/.codex/generated_images/01a0fb5f-a61c-7fd1-93b6-6ae3cc3a51ed/exec-d7ba3c5e-dd10-43ab-a9b9-a9ad97c2b076.png`.
- 배경 원본: `/Users/leeseungbo/.codex/generated_images/01a0fb5f-a61c-7fd1-93b6-6ae3cc3a51ed/exec-b9895827-f907-467e-8982-35d8613c866c.png`.
- 캐릭터 원본: `/Users/leeseungbo/.codex/generated_images/01a0fb5f-a61c-7fd1-93b6-6ae3cc3a51ed/exec-6f8c47b5-c26c-4a6c-a897-ac304c70be9f.png`.
- 모션은 CSS/SVG 레이어 애니메이션이며 실제 3D 메시를 생성한 것은 아니다. UI 글자는 이미지에서 제거하고 HTML로 유지한다.

## 배경 생성 프롬프트

Edit this approved stone tribunal preview into its EMPTY BACKGROUND PLATE for a layered animated website. Preserve the exact architectural design, frontal symmetrical perspective, lighting, materials and spatial arrangement of the reference: monumental circular limestone tribunal, tall columns and arches, dome skylight, black hanging banners, bronze warm lamps, stepped dark wood galleries, two opposing lecterns, judge's crescent dais, large concentric stone floor with bronze circular inlay. REMOVE the entire black floating Judgeman character, white mask, all three hanging scales and their shadow; inpaint believable unobstructed rear dais, stone steps and central floor behind it. REMOVE the dark top and bottom UI strips, all text and any borders, fill the image edge-to-edge with the courtroom by showing its full same scene. No text, labels, UI, watermarks, people, figures, robots, scales or statues. Keep center floor empty for overlay. Premium photorealistic cinematic 3D materials, same warm grey stone and bronze palette, naturally detailed stone/wood, soft skylight, readable shadows. Wide 3:2 landscape composition; do not redesign the approved architecture. Background plate only.

## 캐릭터 생성 프롬프트

Extract and faithfully recreate ONLY the single 3D Judgeman character from the supplied approved courtroom preview as a genuine transparent PNG cutout. Preserve its precise identity and material style: inverted triangular floating black fabric spirit with two outstretched pointed sides, heavy subtly woven charcoal cloth in rounded layered folds, pale elongated ivory sculpted mask with both eyes sewn shut and small purple lips, two large bronze pans suspended symmetrically from the outer points and a third small bronze pan suspended beneath the tapered bottom tip. Keep the same dimensional 3D rendering, neutral expression, shape and pose. Match soft overhead skylight and restrained warm bronze reflections from the reference. Entire character and all chains and all THREE pans fully in view, generous at least 8% transparent margins on every side, square canvas. Design the three hanging scale chains and pans with clear transparent space separating them from the cloth so these areas can be independently animated; keep arms raised enough that chains hang straight down without overlapping fabric, and bottom chain begins below the cloth tip. Both large pan chains connect at their corresponding wing tips and pans are level. No human body parts. No floor shadow. No background, no courtroom, no UI, no top/bottom strips, no text, no watermark, no extra objects. This must be a realistic cinematic 3D-rendered cutout, not hand-drawn art; fabric should look thick and tactile. TRUE TRANSPARENT BACKGROUND with alpha.

## 자산 확인

- 빈 배경: 1536×1024 불투명 PNG, 약 2.4MB.
- 캐릭터: 1254×1254 투명 PNG, 약 1.0MB. 모서리와 천칭 사이 빈 영역의 alpha=0을 확인했다.
- 캐릭터와 배경의 이미지 원본은 수정하지 않고 별도 경로로 복사했다.
