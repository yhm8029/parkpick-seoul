# Fee-rate label and commercial licensing design

Date: 2026-08-26

## Goal

Make each recommendation card explain the rate behind its estimated parking fee, and change future releases from MIT to a source-available model that permits personal, educational, evaluation, development, testing, and other noncommercial use while requiring a paid license for commercial production use.

## Scope

This change has two independent parts:

1. Add a compact fee-rate label to `ParkingCard`.
2. Replace the repository's licensing metadata and documentation with Business Source License 1.1 terms plus a commercial-license contact path.

It does not change fee calculation, recommendation ranking, parking data ingestion, navigation, or map behavior.

## Fee-rate label

### Placement

Keep the existing three-column metrics layout. In the `예상요금` metric, replace the current `할인 전` helper text with the rate label. This is the approved visual option A because it preserves card width and mobile wrapping behavior.

### Formatting rules

Create one pure formatter for `FeeRule` and use it from `ParkingCard`.

- `isFree === true`: `무료`
- Valid base and additional units with the same minutes and fee: `{minutes}분당 {fee}`
- Valid but different base and additional units: `기본 {baseMinutes}분 {baseFee} · 추가 {additionalMinutes}분 {additionalFee}`
- Only a valid base unit: `기본 {baseMinutes}분 {baseFee}`
- Only a valid additional unit: `추가 {additionalMinutes}분 {additionalFee}`
- No usable unit: `요금 기준 확인 필요`

Amounts use the existing `formatCurrency` formatter. A valid unit requires a positive minute count and a nonnegative numeric fee. Daily maximum fees remain part of the estimated-fee calculation and are not repeated in this compact label.

### Testing

Keep tests focused. Add formatter assertions for the shared-rate, different-rate, free, and missing-data branches, plus one component-level assertion that the chosen rate label is rendered in a real recommendation card. Do not add screenshot or pixel-level tests.

## Licensing

### Model

Use Business Source License 1.1 (`BUSL-1.1`) for releases from this change onward.

- Licensor: `HyunM`
- Licensed Work: `ParkPick Seoul 0.2.0 and later versions distributed with this License`
- Change Date: `2030-08-26`
- Change License: `Apache License, Version 2.0 (Apache-2.0)`
- Additional Use Grant: `You may make Production Use of the Licensed Work solely for personal, educational, research, evaluation, or other noncommercial purposes, provided that such Production Use is not offered as a paid service and does not generate revenue. Any Production Use not expressly permitted by this Additional Use Grant requires a separate commercial license.`
- Commercial licensing contact: GitHub Issues at `https://github.com/yhm8029/parkpick-seoul/issues`

Development and testing that are non-production use are already permitted by the standard BSL 1.1 terms. The Additional Use Grant only expands permitted production use for the listed noncommercial purposes; it must not narrow the standard rights to copy, modify, redistribute, or make non-production use.

Use the unmodified BSL 1.1 standard terms with the project-specific parameter block above. Add a short `COMMERCIAL-LICENSE.md` that explains when a paid license is required and how to request one; it is an inquiry notice, not a substitute commercial contract or a public price promise. Commercial production, paid-service operation, and revenue-generating deployment are the inquiry cases.

Update `package.json` to version `0.2.0` and SPDX identifier `BUSL-1.1`. Update the README license section to summarize the two paths and link to the BSL `LICENSE` and the `COMMERCIAL-LICENSE.md` inquiry notice. Preserve a separate project copyright notice, `Copyright (c) 2026 HyunM`; the MariaDB copyright in the standard text applies to the license text, not to ParkPick Seoul.

### Transition boundary

Do not rewrite Git history. Replace the license and metadata visible on the current `main` branch and apply the new terms to version `0.2.0` and later versions distributed with the new `LICENSE`. The README does not need to highlight superseded license metadata.

### Legal boundary

This repository documentation describes the intended licensing model but is not legal advice. A lawyer should review the commercial agreement before the project begins selling licenses or accepting material commercial contracts.

## Delivery and verification

1. Commit this design separately and push it to `origin/main` with `Done` and `Remaining` in the commit body.
2. Implement the fee formatter through one red-green TDD cycle.
3. Apply the BSL text and metadata/documentation updates.
4. Run focused tests, then `npm run typecheck`, `npm test`, and `npm run build`.
5. Commit and push the implementation with `Done` and `Remaining` in the commit body.
6. Redeploy Vercel production and verify the public page and recommendation API.

## Authoritative references

- Business Source License 1.1: https://mariadb.com/bsl11/
- SPDX license metadata: https://spdx.org/licenses/BUSL-1.1.html
- Apache License 2.0: https://www.apache.org/licenses/LICENSE-2.0
