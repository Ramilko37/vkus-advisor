const streetPrefix = /^(?:ул(?:ица)?\.?|пр(?:оспект|-кт)\.?|пер(?:еулок)?\.?|ш(?:оссе)?\.?|наб(?:ережная)?\.?|б-р|бул(?:ьвар)?\.?)\s*/i;
const housePrefix = /^(?:д(?:ом)?\.?\s*)/i;
const buildingPrefix = /^(?:стр(?:оение)?\.?\s*)/i;

export function formatDeliveryAddress(value: string): string | null {
  const address = value.replace(/\s+/g, " ").trim();
  if (!address) return null;

  const parts = address.split(",").map((part) => part.trim()).filter(Boolean);
  const streetPart = parts.find((part) => streetPrefix.test(part));
  const housePart = parts.find((part) => housePrefix.test(part));
  const buildingPart = parts.find((part) => buildingPrefix.test(part));

  if (streetPart && housePart) {
    const street = streetPart.replace(streetPrefix, "").trim();
    const house = housePart.replace(housePrefix, "").trim();
    const building = buildingPart?.replace(buildingPrefix, "").trim();
    return `${street}, ${house}${building ? `с${building}` : ""}`;
  }

  const withoutRegion = parts.filter((part, index) => {
    if (index >= parts.length - 2) return true;
    return !/^(?:г(?:ород)?\.?|Россия|Российская Федерация|обл(?:асть)?\.?)\s*/i.test(part);
  });
  const fallback = withoutRegion[withoutRegion.length - 1] ?? address;
  return fallback
    .replace(streetPrefix, "")
    .replace(housePrefix, "")
    .trim();
}
