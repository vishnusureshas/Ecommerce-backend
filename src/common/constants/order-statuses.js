/**
 * Order statuses and the explicit transition map (§13 of the plan).
 * `cancelled` and `delivered` are terminal.
 */
export const ORDER_STATUSES = Object.freeze({
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  PROCESSING: 'processing',
  SHIPPED: 'shipped',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
});

export const ORDER_STATUS_VALUES = Object.freeze(Object.values(ORDER_STATUSES));

export const ORDER_TRANSITIONS = Object.freeze({
  pending: ['confirmed', 'cancelled'],
  confirmed: ['processing', 'cancelled'],
  processing: ['shipped', 'cancelled'],
  shipped: ['delivered'],
  delivered: [],
  cancelled: [],
});

export function canTransitionOrderStatus(from, to) {
  return (ORDER_TRANSITIONS[from] ?? []).includes(to);
}
