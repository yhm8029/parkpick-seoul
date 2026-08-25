# Nearby Public Parking and Navigation Design

## Goal

ParkPick must recommend genuinely nearby Seoul public parking instead of filling the top three with remote lots. The planner must keep the map stable while distance settings change, and every navigation button must open a route from the selected origin to the selected parking lot.

## Confirmed root causes

- `GetParkInfo` returns `LAT=0.0` and `LOT=0.0` for several Gangnam district public lots, so the current static-coordinate join rejects them.
- The Seoul Parking Information System proximity response has usable coordinates and current parking counts for those same lot codes.
- `recommendParking()` drops its 3 km filter whenever fewer than three candidates remain and then selects from all Seoul lots.
- The current walk-limit slider calls `invalidateResult()` on every change.
- The desktop NAVER directions URL passes WGS84 longitude and latitude where NAVER's web directions path expects Web Mercator coordinates. The navigation component also does not receive the selected origin.

## Data design

Add a server-only nearby-parking client for the Seoul Parking Information System proximity search. It will:

- submit the destination latitude and longitude with a bounded search range and timeout;
- validate the response envelope and every coordinate;
- keep public on-street and off-street types (`NS`, `NW`) only;
- exclude tourist-bus-only lots;
- normalize parking code, name, address, capacity, fee, coordinates, update time, and current occupancy into `ParkingLot`;
- record the source as `SEOUL_PARKING_PORTAL`, distinct from the documented `SEOUL_OPEN_DATA` feed;
- treat `cur_parking` as occupied spaces and mark it live only when `que_status === "1"`, the count is numeric, and `cur_parking_time` parses to an age from zero through 30 minutes;
- mark all other lots as realtime unsupported rather than inventing availability;
- cache by rounded destination and requested range for a short TTL;
- fall back to the existing Seoul Open API source if proximity search fails.

A valid empty proximity response means that no nearby public parking was found and does not trigger fallback. Only a timeout, HTTP error, error envelope, or schema failure triggers the documented Open API fallback. The nearby recommendation path never substitutes demo parking lots after source failure.

This proximity endpoint is not a documented Open API. The client therefore stays isolated behind one adapter, fails closed on schema drift, and retains the existing documented Open API fallback. A production release should replace it with an approved parking dataset when the public-data key has access; the current local key returns `SERVICE_KEY_IS_NOT_REGISTERED_ERROR` for the nationwide parking dataset.

## Distance policy

Replace `maxWalkMinutes` with `maxDistanceMeters`.

- Default mode is `AUTO`; there is no fixed 300 m default.
- Requests use a discriminated contract: `{ distanceMode: "AUTO" }` or `{ distanceMode: "MANUAL", maxDistanceMeters }`.
- Auto mode requests the proximity service's validated 1 km limit once, de-duplicates by parking code, orders candidates by exact destination distance and then parking code, and selects the nearest three candidates. Auto selection means valid public parking candidates, not only lots reporting a current vacancy.
- Auto reports the selected farthest candidate distance rounded up to the next 50 m as `effectiveDistanceMeters`; it reports `null` when there are no candidates.
- Manual mode exposes a `최대 거리` slider from 50 m through 1,000 m in 50 m increments. It requests only that range, never expands automatically, and never promotes an out-of-range lot to fill three slots.
- The first AUTO-to-manual switch initializes the slider from the last applied automatic radius, clamped and rounded to the slider range. With no applied radius it uses 1,000 m; later mode switches preserve the user's last manual value.
- If only zero to two lots satisfy the rule, the response contains only those lots. Empty results produce an honest nearby-parking message.
- Scoring ranks only the eligible nearby candidates; availability, fee, drive time, and reliability cannot reintroduce an out-of-range lot.

The API response includes the effective search radius so the UI can explain the automatic choice without presenting 300 m as a default.

## Stable editing flow

Changing distance settings updates draft form state only. It must not clear recommendations, active markers, or the map during range input events. Draft origin, destination, and conditions are separate from the last successfully applied request and result.

- `조건 변경` enters editing mode while retaining the last successful result on the map.
- The slider uses `step=50` and does not call `invalidateResult()` while dragging.
- A successful non-empty recommendation atomically replaces the retained result and applied origin; it preserves the active lot only if that lot still exists, otherwise it selects the first result.
- A successful empty recommendation atomically replaces old recommendations with an honest empty state and removes old markers. A network or schema failure retains the previous result, labels it as the previous result, and keeps the form editable.
- Aborted and superseded requests never commit state. Editing and recalculation show concise messages without flashing between result and planner layouts.

## Navigation design

Thread the selected origin through `RecommendationPanel`, `ParkingCard`, and `NavigationButtons`.

- Android and iOS use NAVER's documented `nmap://navigation` parameters with explicit `slat`, `slng`, `sname`, `dlat`, `dlng`, and `dname`.
- Desktop converts origin and parking WGS84 coordinates to EPSG:3857 Web Mercator `{x,y}` coordinates and builds a NAVER web directions URL with the applied origin segment first and the represented parking segment second.
- Kakao navigation continues to target the selected parking lot and receives the same origin context where supported.
- Every card, compact active-route control, and mobile control shares one URL builder and routes from the last applied origin to the parking lot represented by that control. Draft values and the planner destination are never substituted into an existing result's route.

## Failure handling

- Reject malformed proximity responses and invalid coordinates.
- Use timeouts and the existing Open API fallback; never silently return demo lots as live nearby results.
- Clearly label realtime-unsupported lots and omit predicted availability when current occupancy is unavailable.
- Never send API keys to the browser or logs.

## Verification

Keep verification focused:

- one adapter test for valid public filtering and realtime-unsupported normalization;
- one recommendation regression proving remote fallback cannot occur;
- one UI test for 50 m distance steps and stable draft editing;
- one navigation test for explicit origin and destination URLs;
- a local Gangnam Station API/browser check confirming nearby public lots, stable map rendering, and route URLs.
