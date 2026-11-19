// "Find a label" box: a typed label number, e.g. /l?number=123.
import { NextResponse, type NextRequest } from "next/server";
import { labelPath, parseLabelNumber } from "@/lib/items/rules";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("number") ?? "";
  const serial = parseLabelNumber(raw);
  const to = serial ? labelPath(serial) : `/labels/unknown?number=${encodeURIComponent(raw.slice(0, 20))}`;
  return NextResponse.redirect(new URL(to, request.url));
}
