/**
 * Pricing Engine for EventSync.
 * Calculates transparent pricing breakdowns:
 * - Base hall charge
 * - Staff assistance
 * - 18% GST Tax
 * - 25% Advance Escrow Deposit
 * - 75% Balance due on event day
 */

export interface PricingResult {
  durationHours: number;
  hallHourlyRate: number;
  hallCharge: number;
  staffCharge: number;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  advanceDeposit: number;
  balanceDue: number;
}

export function calculateEventPricing(
  durationHours: number,
  hallHourlyRate: number = 3500,
  staffCount: number = 0,
  staffHourlyRate: number = 600
): PricingResult {
  const duration = Math.max(1.0, durationHours);
  const hallCharge = Math.round(duration * hallHourlyRate * 100) / 100;
  const staffCharge = Math.round(duration * staffCount * staffHourlyRate * 100) / 100;

  const subtotal = Math.round((hallCharge + staffCharge) * 100) / 100;
  const taxAmount = Math.round(subtotal * 0.18 * 100) / 100; // 18% GST
  const totalAmount = Math.round((subtotal + taxAmount) * 100) / 100;
  const advanceDeposit = Math.round(totalAmount * 0.25 * 100) / 100; // 25% Advance
  const balanceDue = Math.round((totalAmount - advanceDeposit) * 100) / 100;

  return {
    durationHours: duration,
    hallHourlyRate,
    hallCharge,
    staffCharge,
    subtotal,
    taxAmount,
    totalAmount,
    advanceDeposit,
    balanceDue,
  };
}
