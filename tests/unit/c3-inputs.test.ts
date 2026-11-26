// Round C3 and C4: website actions given bad input, uploads checked by
// their content, label addresses from a fixed setting, the activity cookie.
//
// Each action is called with nonsense in place of every id, yes/no and
// kind. The sign-in check and the database are replaced by traps that fail
// the test if reached: an action must refuse before touching either.
import { beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/server", () => ({
  createClient: () => {
    throw new Error("TRAP: the database was reached");
  },
}));
vi.mock("@/lib/auth/current-admin", () => ({
  requireAdmin: () => {
    throw new Error("TRAP: the sign-in check was reached");
  },
}));
vi.mock("next/headers", () => ({
  cookies: () => {
    throw new Error("TRAP: the cookies were reached");
  },
  headers: () => {
    throw new Error("TRAP: the request was reached");
  },
}));

import { anyBad, isBool, isDate, isId, isLabelSerial, isMonth, isOneOf, isUuid, NOT_FOUND, orNull } from "@/lib/action-input";
import { activityCookieOptions } from "@/lib/auth/rules";
import { fileFrom, PDF_OR_PICTURE_TYPES } from "@/lib/files";
import { labelOrigin } from "@/lib/labels/origin";

/** Every action module, and the actions in it that are handed something besides the form. */
const ACTIONS: Record<string, string[]> = {
  "@/app/(app)/assets/actions": ["recordAssetEvent", "decideDisposal"],
  "@/app/(app)/categories/actions": ["addCategory", "saveCategory", "setCategoryActive"],
  "@/app/(app)/companies/actions": ["saveCompany", "saveModel", "setActive"],
  "@/app/(app)/documents/actions": ["addDocument", "hideDocument"],
  "@/app/(app)/expenses/actions": ["enterClaim", "decideClaim", "correctClaim", "withdrawRepayment"],
  "@/app/(app)/expenses/settings/actions": ["addListEntry", "renameListEntry", "setListEntryActive", "askSettingChange", "decideSettingChange"],
  "@/app/(app)/items/actions": ["updateItem"],
  "@/app/(app)/labels/actions": ["reprintLabelSheet"],
  "@/app/(app)/library/actions": ["addCopy", "saveBook", "saveCopyNote"],
  "@/app/(app)/library/loan-actions": ["findCopy", "saveBorrower", "setBorrowerActive", "lendToBorrower", "lendToNewBorrower", "returnCopy", "moveDueDate", "undoReturn", "markCopy"],
  "@/app/(app)/people/actions": ["savePerson", "setPersonActive", "setPersonAccount"],
  "@/app/(app)/people/training-actions": ["recordTraining", "withdrawTraining", "saveTrainingType", "setTrainingTypeActive"],
  "@/app/(app)/people/vetting-actions": ["recordVetting", "withdrawVetting"],
  "@/app/(app)/places/actions": ["addPlace", "savePlace", "setPlaceActive"],
  "@/app/(app)/places/[id]/register/actions": ["startRoomRegister", "finishRoomRegister", "registerInRoom"],
  "@/app/(app)/policies/actions": ["savePolicy", "saveRequiredRoles", "setPolicyActive", "uploadVersion", "saveDraft", "publishVersion"],
  "@/app/(app)/policies/signoff-actions": ["recordSignoffs", "withdrawSignoff"],
  "@/app/(app)/renewals/actions": ["saveRenewal", "setRenewalActive", "markRenewed", "withdrawDueDate"],
  "@/app/(app)/rota/actions": ["savePrayerMonth", "saveSlotType", "setSlotTypeActive", "moveSlotType"],
  "@/app/(app)/rota/templates/actions": ["addTemplateSlot", "setTemplateSlotActive", "applyTemplate"],
  "@/app/(app)/rota/week-actions": ["startWeek", "assignPerson", "assignMore", "removeSlot", "addSlot", "publishWeek"],
  "@/app/(app)/stock/actions": ["recordOne", "recordWeeklyCount", "requestCorrection", "decideCorrection"],
  "@/app/(app)/stocktake/actions": ["carryOn", "stopScanning", "openLabel", "recordScan", "submitStocktake", "decideDifference"],
  "@/app/(app)/tickets/actions": ["reportProblem", "recordTicketStep"],
  "@/app/(app)/vehicles/actions": ["saveVehicle", "setVehicleActive", "recordRenewal", "withdrawRenewal"],
  "@/app/(app)/board-report/actions": ["makeFinalCopy"],
  // Round C5.
  "@/app/(app)/accounts/actions": ["giveTemporaryPassword", "resetTwoFactor", "setAccountActive", "linkPerson"],
};

/** What a tampering browser might send instead of a record id, a yes/no or a kind. */
const NONSENSE: unknown[] = ["not-an-id", "../../etc", -1, 1.5, { id: 1 }, "app_users"];

/** Refused calmly: "could not be found" (or a page of that name), never the database. */
async function outcome(run: () => Promise<unknown>): Promise<string> {
  try {
    const r = (await run()) as { error?: string | null } | undefined;
    return r && typeof r === "object" && typeof r.error === "string" ? `error: ${r.error}` : `returned ${JSON.stringify(r)}`;
  } catch (e) {
    const err = e as { message?: string; digest?: string };
    if (err.message?.startsWith("TRAP")) return err.message;
    if (String(err.digest).includes("404")) return "not found page";
    if (String(err.digest).startsWith("NEXT_REDIRECT")) return `redirect ${String(err.digest).split(";")[2]}`;
    return `crashed: ${err.message}`;
  }
}

describe("every website action refuses nonsense before the sign-in check or the database", () => {
  const modules: Record<string, Record<string, (...a: unknown[]) => Promise<unknown>>> = {};
  beforeAll(async () => {
    for (const path of Object.keys(ACTIONS)) modules[path] = await import(/* @vite-ignore */ path);
  });

  for (const [path, names] of Object.entries(ACTIONS)) {
    for (const name of names) {
      it(`${path.split("/(app)/")[1]} ${name}`, async () => {
        const fn = modules[path][name];
        expect(typeof fn, name).toBe("function");
        for (const bad of NONSENSE) {
          // Every argument the nonsense, and an empty form where the form goes.
          const args = Array.from({ length: Math.max(fn.length, 1) }, () => bad);
          args[args.length - 1] = new FormData();
          if (args.length > 1) args[args.length - 2] = { error: null, values: null };
          const got = await outcome(() => fn(...args));
          expect(got, `${name}(${JSON.stringify(bad)})`).not.toMatch(/TRAP|crashed/);
          expect(got, `${name}(${JSON.stringify(bad)})`).toMatch(/could not be found|Choose a month|not found page|Unknown|That setting|redirect/);
        }
      });
    }
  }

  it("a document upload passes on only the two expected fields", async () => {
    const { addDocument } = await import("@/app/(app)/documents/actions");
    const id = crypto.randomUUID();
    for (const owner of [{ item_id: id, hidden: true }, { model_id: id, item_id: id }, {}, { item_id: "x" }]) {
      expect(await outcome(() => addDocument(owner as never, "/", { error: null }, new FormData())), JSON.stringify(owner)).toBe(`error: ${NOT_FOUND}`);
    }
  });

  it("switching off accepts only companies or makes and models", async () => {
    const { setActive } = await import("@/app/(app)/companies/actions");
    for (const table of ["app_users", "roles", "audit_log", "items"]) {
      expect(await outcome(() => setActive(table as never, crypto.randomUUID(), false))).toBe(`error: ${NOT_FOUND}`);
    }
  });
});

describe("the input checks themselves", () => {
  it("ids, yes/no, kinds, dates, months and label numbers", () => {
    expect(isUuid(crypto.randomUUID())).toBe(true);
    for (const v of ["", "x", 1, null, undefined, {}, `${crypto.randomUUID()} `]) expect(isUuid(v), String(v)).toBe(false);
    expect(isId(1)).toBe(true);
    for (const v of [0, -1, 1.5, "1", NaN, Number.MAX_SAFE_INTEGER + 2]) expect(isId(v), String(v)).toBe(false);
    expect(isBool(false)).toBe(true);
    expect(isBool("false")).toBe(false);
    expect(isOneOf("up", ["up", "down"])).toBe(true);
    expect(isOneOf("sideways", ["up", "down"])).toBe(false);
    expect(isDate("2026-11-30")).toBe(true);
    for (const v of ["2026-13-01", "2026-11-3", "30/11/2026", 20261130]) expect(isDate(v), String(v)).toBe(false);
    expect(isMonth("2026-11")).toBe(true);
    expect(isMonth("2026-00")).toBe(false);
    expect(isLabelSerial("ICCI-000123")).toBe(true);
    expect(isLabelSerial("123")).toBe(false);
    expect(orNull(isUuid)(null)).toBe(true);
    expect(orNull(isUuid)(undefined)).toBe(false);
    expect(anyBad(true, true)).toBe(false);
    expect(anyBad(true, false)).toBe(true);
  });
});

describe("uploads are checked by what is inside, not by their name", () => {
  const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  const form = (name: string, type: string, bytes: Uint8Array | string) => {
    const f = new FormData();
    f.set("photo", new File([bytes as BlobPart], name, { type }));
    f.set("file", new File([bytes as BlobPart], name, { type }));
    return f;
  };
  const rules = { types: PDF_OR_PICTURE_TYPES, maxMb: 10, what: "file", typesText: "a PDF or a picture" };

  it("a web page or program named like a picture is refused", async () => {
    const { photoFrom } = await import("@/app/(app)/items/photos");
    for (const bytes of ["<html><script>alert(1)</script>", "MZ program"]) {
      expect(await photoFrom(form("photo.png", "image/png", bytes))).toMatch(/must be a JPEG, PNG or WebP/);
      expect(await fileFrom(form("manual.png", "image/png", bytes), "file", rules)).toMatch(/must be a PDF or a picture/);
    }
    expect(await fileFrom(form("manual.pdf", "application/pdf", "not a pdf"), "file", rules)).toMatch(/does not look like a real PDF/);
  });

  it("a real picture is accepted, and saved as what it really is", async () => {
    const { photoFrom } = await import("@/app/(app)/items/photos");
    const photo = await photoFrom(form("photo.jpg", "image/jpeg", PNG));
    expect(photo).toBeInstanceOf(File);
    expect((photo as File).type).toBe("image/png");
    const file = await fileFrom(form("scan.jpg", "image/jpeg", PNG), "file", rules);
    expect(file).toMatchObject({ ext: "png" });
  });
});

describe("printed label addresses", () => {
  it("come from the fixed setting, then the web host's own address, then this PC", () => {
    expect(labelOrigin({ SITE_URL: "https://dashboard.example/some/path" })).toBe("https://dashboard.example");
    expect(labelOrigin({ VERCEL_PROJECT_PRODUCTION_URL: "icci-demo.vercel.app" })).toBe("https://icci-demo.vercel.app");
    expect(labelOrigin({ SITE_URL: "javascript:alert(1)", VERCEL_PROJECT_PRODUCTION_URL: "icci-demo.vercel.app" })).toBe("https://icci-demo.vercel.app");
    expect(labelOrigin({})).toBe("http://localhost:3000");
  });
});

describe("the activity cookie", () => {
  it('is marked "secure" on the real site (https) only', () => {
    expect(activityCookieOptions(true)).toMatchObject({ secure: true, sameSite: "lax", path: "/" });
    expect(activityCookieOptions(false).secure).toBe(false);
  });
});
