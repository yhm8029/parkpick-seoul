import { NextResponse } from "next/server";
import { searchPlaces } from "@/lib/api/kakao-places";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 2) return NextResponse.json({ places: [], mode: "DEMO", notice: "두 글자 이상 입력해 주세요." });
  return NextResponse.json(await searchPlaces(query), { headers: { "Cache-Control": "private, max-age=60, stale-while-revalidate=300" } });
}
