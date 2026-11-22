// Numerical formatting helpers for trading platform
export function formatQty(qty: string | number | undefined | null): string {
  if (qty === undefined || qty === null || qty === "") return "0";
  const num = typeof qty === "number" ? qty : parseFloat(qty);
  if (isNaN(num)) return "0";
  // Round to 6 decimal places and eliminate 0.3999999999999999 IEEE 754 float precision artifacts
  return parseFloat(num.toFixed(6)).toString();
}

export function formatPrice(price: string | number | undefined | null): string {
  if (price === undefined || price === null || price === "") return "0";
  const num = typeof price === "number" ? price : parseFloat(price);
  if (isNaN(num)) return "0";
  return num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
