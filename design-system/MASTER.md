# AFTER HOURS / 准点下班 — UI specification

Approved 2026-10-18: redesign the complete menu, HUD, settings, pause and results in a restrained cinematic office-suspense style. User approved implementation after scope and direction questions.

## Evidence and judgment

UI/UX Pro Max SKILL.md and its design-system, style and UX searches were consulted. The initial automatic search suggested a neon cyberpunk/bento layout; this conflicts with the approved office-suspense direction and was rejected. Applied evidence: a clear primary action, dark-surface hierarchy, consistent icons, visible keyboard focus, adequate text contrast, at least 44px interactive targets, reduced motion and actual responsive verification. Cinematic/minimal style search informed hierarchy rather than adding costly blur or ambient animations.

## Tokens

- Background #101417; surface #181E22; raised surface #22292D.
- Main text #F2EDE3; secondary text #B5B3AC; amber action #DDA65A; brighter amber #EFBF7E.
- Alert #EF9585; safe #B8CABB. States also have text, borders, numeric values or selection markers.
- Title: installed Songti/SimSun serif stack. Controls/body: Segoe UI / Microsoft YaHei / PingFang SC. Numeric metadata: installed monospace. No font requests or paid assets.
- Fine borders, 3px shared control radius; 44px or larger action targets; hover/focus/selected/disabled/pressed states.
- 150–180ms opacity/transform transitions. All nonessential motion supports both the in-game reduced-motion option and OS preference.

## Composition and hierarchy

- Title: full-bleed existing office scene; four-character poster title; one primary action. A valid unfinished save moves Continue to the first DOM position and exposes the saved area/difficulty. Empty or completed runs prioritize New Game. Secondary vertical navigation and distinct new-run difficulty controls. Right-hand floor/checkpoint annotation on desktop.
- HUD: chapter left, time centered, tools/right-hand alert, task left. Center remains for the player. Task/tutorial disclosures support keyboard and touch. Compact mobile guide begins collapsed. Native touch controls keep the existing input contract.
- Settings: five native ARIA tabs, roving tabindex and arrow/Home/End navigation; sidebar on desktop and bounded five-column category bar on phone. Only active content scrolls. Footer remains visible. SettingsManager continues to validate/store values.
- Dialogs: one panel frame for pause, chapters, confirmation, instructions, credits, keypad, failure and victory. Error/retry stays clear. Dynamic feedback is inside the native modal to avoid background inert behavior.
- Loading/failure: same typography/action system; honest resource messages and reload recovery. Development-only fixtures support visual inspection.

## Engineering boundaries

Views and shared controls are in src/ui/views; tokens and menu/HUD/settings styles are separate. GameUI owns event coordination. The simulation, character/furniture files, navigation/collision, animation/quality policies, model licensing and save schema are preserved. Test storage uses the existing DEV-only qa keys; normal production storage is not reset.

## Acceptance

Inspect desktop 1440×900 and 1024×768; phone 375×812 and 320×568; landscape 844×390; plus enlarged text/zoom-equivalent layouts. Check menu/no-save/continue, settings categories, controls, chapters, HUD and touch actions, modal transitions, results, loading/error, focus and motion. Record current evidence in docs/UI_REDESIGN_2026-10-18.md and qa/ui-redesign-*.json. Browser tests establish only the Chromium session actually exposed by the tool.

## Responsive correction — 2026-10-22
Touch controls also follow any-pointer:coarse, independent of viewport size, including hybrid pointer devices. Existing compact viewport fallbacks remain. In that layout an expanded native objective disclosure hides the minimap; collapsing restores it unless interaction/tutorial visibility rules also suppress it. CSS owns the relationship so resize/orientation changes cannot leave stale UI state. Input, saves and gameplay rules are unchanged.
