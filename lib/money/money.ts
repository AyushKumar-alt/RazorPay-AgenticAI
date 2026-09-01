/**
 * Helper functions for handling monetary values safely in integer paise.
 * ₹1 = 100 paise.
 * Avoids floating-point precision issues in financial calculations.
 */

export function paiseToRupees(paise: number): number {
  return Math.round(paise) / 100;
}

export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export function formatRupees(paise: number): string {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
    minimumFractionDigits: 0,
  }).format(rupees);
}

export function formatRupeesExact(paise: number): string {
  const rupees = paiseToRupees(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  }).format(rupees);
}

export function addPaise(a: number, b: number): number {
  return Math.round(a) + Math.round(b);
}

export function subPaise(a: number, b: number): number {
  return Math.round(a) - Math.round(b);
}
