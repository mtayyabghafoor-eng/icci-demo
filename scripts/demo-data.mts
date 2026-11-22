// Real-world details for the ICCI Staging demo ONLY (owner's decision,
// 22 Nov 2026: "use real Irish companies" and "real manufacturer manuals").
//
// Development and every automatic test keep the obviously fictional
// "Example ... Ltd" companies in seed-data.mts. Only "npm run db:seed:staging"
// uses this file.
//
// Companies: real Dublin firms, details as shown on their Golden Pages
// listings when looked up on 22 Nov 2026. Listing them here does not mean
// ICCI uses them. Makers: the real brands of the demo equipment.
// Manuals: real PDFs published by the makers, downloaded with the owner's
// approval into the git-ignored folder demo-files/ (never committed). The
// seed skips a manual whose file is not there.
import type { SeedCompany, SeedModel } from "./seed-data.mts";

export const DEMO_FILES_DIR = "demo-files";

export const DEMO_COMPANIES: SeedCompany[] = [
  {
    name: "Electric Gates Dublin",
    kinds: ["installer", "service"],
    phone: "086 856 0063",
    email: "",
    website: "https://sites.google.com/view/electric-gate-repairs-dublin/home",
    notes: "Electric gate installation, maintenance and repairs, Dublin and Leinster. Repairs Monday to Friday, 8am to 6pm.",
  },
  {
    name: "Eagle Air Conditioning",
    kinds: ["supplier", "installer", "service"],
    phone: "01 901 4314",
    email: "",
    website: "https://www.eagleair.ie",
    notes: "71 Mount Prospect Drive, Clontarf, Dublin 3, D03 FY20. Mitsubishi Electric partner; F-Gas registered.",
  },
  {
    name: "Irish Grass Machinery",
    kinds: ["supplier", "service"],
    phone: "01 899 1212",
    email: "",
    website: "https://www.irishgrassmachinery.ie",
    notes: "Unit 39 Rosemount Park Drive, Blanchardstown, Dublin 11, D11 RW61. Sales, service and delivery of garden machinery.",
  },
  {
    name: "Aqua Fire Prevention Ltd",
    kinds: ["supplier", "service"],
    phone: "01 452 7016",
    email: "",
    website: "https://aquafire.ie",
    notes: "Unit 8 Cookstown Square, Cookstown Industrial Estate, Dublin 24, D24 VX23. Extinguisher service and refills; FIAI member.",
  },
  {
    name: "King Security Systems",
    kinds: ["installer", "service"],
    phone: "085 192 1661",
    email: "",
    website: "https://kingsecuritysystems.ie",
    notes: "Poppintree, Dublin 11. CCTV, alarms and door access.",
  },
  { name: "FAAC", kinds: ["maker"], phone: "", email: "", website: "https://www.faac.it", notes: "Gate motor maker. Service through local FAAC installers." },
  { name: "Mitsubishi Electric", kinds: ["maker"], phone: "", email: "", website: "", notes: "Air conditioner maker. Service through Mitsubishi Electric partners." },
  { name: "Honda", kinds: ["maker"], phone: "", email: "", website: "", notes: "Lawnmower maker." },
];

export const DEMO_MODELS: (SeedModel & { manualFile?: string; manualTitle?: string })[] = [
  {
    maker: "Mitsubishi Electric",
    model: "MSZ-AP25VG",
    category: "Air conditioners",
    service: "Eagle Air Conditioning",
    warrantyMonths: 60,
    manual: true,
    manualFile: "mitsubishi-msz-ap.pdf",
    manualTitle: "MSZ-AP operation manual (Mitsubishi Electric)",
  },
  { maker: "Mitsubishi Electric", model: "PLA-M100EA", category: "Air conditioners", service: "Eagle Air Conditioning", warrantyMonths: 60, manual: false },
  {
    maker: "Honda",
    model: "HRX476C",
    category: "Lawnmowers",
    service: "Irish Grass Machinery",
    warrantyMonths: 60,
    manual: false,
    notes: "Owner's manual: on Honda's own owners' manuals pages (the PDF is 16 MB, over the 10 MB upload limit).",
  },
  {
    maker: "FAAC",
    model: "391 swing gate operator",
    category: "Automatic gates and barriers",
    service: null,
    warrantyMonths: 24,
    manual: true,
    manualFile: "faac-391.pdf",
    manualTitle: "391 installation manual (FAAC)",
  },
];

/** Which demo items get which model and supplier (start of their demo name). */
export const DEMO_ITEM_LINKS: { namePrefix: string; model?: string; supplier?: string; service?: string }[] = [
  { namePrefix: "Wall air conditioner", model: "MSZ-AP25VG", supplier: "Eagle Air Conditioning" },
  { namePrefix: "Ceiling air conditioner", model: "PLA-M100EA", supplier: "Eagle Air Conditioning" },
  { namePrefix: "Lawnmower", model: "HRX476C", supplier: "Irish Grass Machinery" },
  { namePrefix: "Main entrance gate", model: "391 swing gate operator" },
  { namePrefix: "Car park barrier", service: "Electric Gates Dublin" },
];

export const DEMO_CATEGORY_CONTACTS: { category: string; service: string | null; contactRole: "Caretaker" | "Gardener" | null }[] = [
  { category: "Garden, tools and cleaning equipment", service: "Irish Grass Machinery", contactRole: "Gardener" },
  { category: "Heating, cooling and water", service: "Eagle Air Conditioning", contactRole: "Caretaker" },
  { category: "Building systems and security", service: null, contactRole: "Caretaker" },
  { category: "Automatic gates and barriers", service: "Electric Gates Dublin", contactRole: null },
  { category: "CCTV", service: "King Security Systems", contactRole: null },
  { category: "Fire alarms and extinguishers", service: "Aqua Fire Prevention Ltd", contactRole: null },
  { category: "Kitchen and catering", service: null, contactRole: "Caretaker" },
  { category: "Furniture and furnishings", service: null, contactRole: "Caretaker" },
];

export const DEMO_REFERRAL = {
  description: "Lawnmower will not start after the winter",
  assetName: "Lawnmower 02",
  reportedBy: "Gardener (by phone)",
  company: "Irish Grass Machinery",
  jobRef: "IGM-24117",
  note: "Collected for repair; carburettor to be cleaned. Ready next week.",
};
