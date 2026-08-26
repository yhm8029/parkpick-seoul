import { NextResponse } from "next/server";
import { fetchVisitStats } from "@/lib/api/vercel-analytics";

export const dynamic = "force-dynamic";

export async function GET() {
  const stats = await fetchVisitStats();
  return NextResponse.json(
    stats ? { available: true, ...stats } : { available: false },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } },
  );
}
