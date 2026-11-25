// "Find a label" box: a typed label number, e.g. /l?number=123.
// A5: a room's code (PL-0007) opens that place, like scanning its label.
import { NextResponse, type NextRequest } from "next/server";
import { labelPath, parseLabelNumber } from "@/lib/items/rules";
import { parsePlaceCode, placePath } from "@/lib/places/rules";

export async function GET(request: NextRequest) {
  const raw = request.nextUrl.searchParams.get("number") ?? "";
  const serial = parseLabelNumber(raw);
  const place = serial ? null : parsePlaceCode(raw);
  const to = serial ? labelPath(serial) : place ? placePath(place) : `/labels/unknown?number=${encodeURIComponent(raw.slice(0, 20))}`;
  return NextResponse.redirect(new URL(to, request.url));
}
