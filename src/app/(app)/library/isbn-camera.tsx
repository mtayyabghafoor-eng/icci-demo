"use client";
// "Scan the barcode" on Add a book (slice P4.3): reads the striped ISBN
// barcode on the back cover with the browser's own barcode reader (Chrome on
// Android has one; nothing new is added to the project). iPhones show
// nothing here and the ISBN is typed. Only a book's ISBN is ever taken.
import { BarcodeCamera, type ScanTarget } from "@/components/shell/camera-scanner";
import { isbnFromBarcode } from "@/lib/library/lookup";

export function IsbnCamera({ label }: { label: string }) {
  const target: ScanTarget = {
    formats: ["ean_13"],
    accept: isbnFromBarcode,
    hrefFor: (isbn) => `/library/new?${label ? `label=${label}&` : ""}isbn=${isbn}`,
    title: "Scan the barcode",
    hint: "Point the camera at the striped barcode on the back cover. The book is looked up by itself.",
    wrongCode: "That is not a book’s ISBN barcode. Point the camera at the barcode on the back cover, or type the number.",
    testId: "isbn-camera",
  };
  return <BarcodeCamera target={target} />;
}
