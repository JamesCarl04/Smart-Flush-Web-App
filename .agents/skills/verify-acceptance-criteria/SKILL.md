---
name: verify-acceptance-criteria
description: >-
  Verify whether Smart-Flush-Web-App code, Firebase rules, Jest/Playwright tests,
  or a live preview satisfy stated acceptance criteria. Use when asked to verify
  acceptance criteria, audit implementation completeness against a spec or plan,
  or issue a release sign-off with an atomic verification matrix.
---

# Verify Acceptance Criteria (`Smart-Flush-Web-App`)

## Goal

Verify whether an implementation in `Smart-Flush-Web-App` satisfies its stated contract using observed code, rules, test output, and safe runtime evidence.

## Step 0 — Ask Only for Missing Essentials

Do **not** invent missing product rules. If any of the following are absent from context, ask concisely only for what is missing:
- The acceptance criteria or authoritative spec / plan / ticket
- The implementation evidence to inspect (files, PR diff, screenshots, API responses, test logs, or running URL)
- The environment under review (local dev, staging/preview, or production)

## Procedure

1. **Normalize Criteria**: Break requirements into atomic, independently verifiable items with stable IDs (`AC-01`, `AC-02`, ...).
2. **Gather Observed Evidence**:
   - Inspect source files (`app/**`, `lib/**`, `components/**`, `mqtt-listener/**`, `firestore.rules`, `storage.rules`) and record exact `file:line` references.
   - Run or inspect relevant verification checks (`npm run lint`, `npm run test:ci`, `npm run test:integration`, `npm run test:security`, `npm run build`).
   - If a live URL (e.g., `http://localhost:3000` or an authorized preview URL) is available and safe to access, inspect the UI/API behavior using Playwright (`npm run test:e2e` / `e2e/`) or the Antigravity `browser` subagent / Chrome DevTools MCP.
3. **Grade Each Item Strictly**:
   - `Met` — Directly verified in code/rules and observed tests or safe live execution.
   - `Partial` — Implemented in part, or behavior exists without full edge-case/test coverage.
   - `Not Met` — Missing, contradicts the criterion, or fails verification.
   - `Untestable` — Ambiguous requirement or required environment/credentials/fixtures unavailable.
   Cite exact observed evidence (`file:line`, command & pass/fail count, HTTP status, or browser observation) for every verdict.
4. **Summarize Readiness**: Clearly separate what is ready to ship, what gaps remain, and what product questions still need clarification.
5. **Recommend One Best Next Step**: End with exactly one primary next action: `fix`, `clarify requirements`, `add tests`, or `re-verify later`.

## Output Format (While Executing This Skill)

Return Markdown containing a Verification Matrix followed by a short Sign-Off Summary:

```markdown
## Acceptance Criteria Verification

| ID | Criterion | Status | Evidence |
| :--- | :--- | :--- | :--- |
| AC-01 | ... | Met / Partial / Not Met / Untestable | `path/file.ts:12-34`; command/observation |

### Sign-Off Summary
- **Ready**: ...
- **Gaps / Follow-up**: ...
- **Clarifications Needed**: ...
- **Recommended Next Step**: `fix` | `clarify requirements` | `add tests` | `re-verify later` — [1-sentence rationale]
```

## Validation Checklist (Self-Check Before Reporting)
- [ ] Every criterion is atomic with a stable `AC-XX` ID and no invented product rules.
- [ ] Every verdict is strictly one of `Met`, `Partial`, `Not Met`, or `Untestable`.
- [ ] Every row cites verified `file:line` paths, test results, or live browser/API observations.
- [ ] Output ends with a single concrete next step (`fix`, `clarify requirements`, `add tests`, or `re-verify later`).

---

## Attribution & License
Adapted for Gemini 4 Hydrogen and `Smart-Flush-Web-App` from [`jaktestowac/awesome-copilot-for-testers`](https://github.com/jaktestowac/awesome-copilot-for-testers/blob/main/prompts/verify-acceptance-criteria.prompt.md):

```text
MIT License

Copyright GitHub, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```
