import mongoose from 'mongoose';
import { AppError } from '../../common/errors/AppError.js';
import { ROLES } from '../../common/constants/roles.js';
import { ORDER_STATUSES, canTransitionOrderStatus } from '../../common/constants/order-statuses.js';
import { parsePagination, toPagedResult } from '../../common/utils/pagination.js';
import { getVisibleCategoryIds } from '../categories/category.service.js';
import { PRODUCT_STATUSES, Product, effectivePriceOf } from '../products/product.model.js';
import { Order } from './order.model.js';

/** Consistent 2-decimal rounding for money amounts. */
function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function toOrderPayload(doc) {
  const o = typeof doc.toObject === 'function' ? doc.toObject() : doc;
  return {
    _id: o._id,
    user: o.user,
    items: (o.items ?? []).map((i) => ({
      product: i.product,
      name: i.name,
      sku: i.sku,
      unitPrice: i.unitPrice,
      quantity: i.quantity,
      lineTotal: i.lineTotal,
    })),
    subtotal: o.subtotal,
    total: o.total,
    status: o.status,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
  };
}

/**
 * Create an order inside a MongoDB transaction (requires a replica set or
 * sharded cluster — Atlas qualifies; see README for local setup):
 *  1. one bulk product fetch within the session,
 *  2. existence / active-status / active-category / duplicate checks,
 *  3. conditional atomic stock decrements (`stock >= qty` — the check and
 *     the update are a single operation, so concurrent orders cannot
 *     oversell; any failure aborts the whole transaction),
 *  4. order creation with server-computed prices and snapshots.
 */
export async function createOrder(customerId, itemsInput = []) {
  const ids = itemsInput.map((i) => String(i.product));
  if (new Set(ids).size !== ids.length) {
    throw AppError.badRequest('Duplicate products in order');
  }

  const session = await mongoose.startSession();
  try {
    let created = null;
    await session.withTransaction(async () => {
      const products = await Product.find({ _id: { $in: ids } }).session(session);
      const byId = new Map(products.map((p) => [String(p._id), p]));

      for (const id of ids) {
        if (!byId.has(id)) {
          throw AppError.notFound('Product not found');
        }
      }

      const visibleCategories = new Set((await getVisibleCategoryIds()).map(String));
      for (const item of itemsInput) {
        const p = byId.get(String(item.product));
        if (p.status !== PRODUCT_STATUSES.ACTIVE || !visibleCategories.has(String(p.category))) {
          throw AppError.conflict(`Product '${p.name}' is unavailable`);
        }
      }

      const lines = [];
      for (const item of itemsInput) {
        const p = byId.get(String(item.product));
        const updated = await Product.findOneAndUpdate(
          { _id: p._id, stock: { $gte: item.quantity } },
          { $inc: { stock: -item.quantity } },
          { session, returnDocument: 'after' },
        );
        if (!updated) {
          throw AppError.conflict(`Insufficient stock for '${p.name}'`);
        }
        const unitPrice = round2(effectivePriceOf(p));
        lines.push({
          product: p._id,
          name: p.name,
          sku: p.sku,
          unitPrice,
          quantity: item.quantity,
          lineTotal: round2(unitPrice * item.quantity),
        });
      }

      const subtotal = round2(lines.reduce((sum, l) => sum + l.lineTotal, 0));
      [created] = await Order.create(
        [
          {
            user: customerId,
            items: lines,
            subtotal,
            total: subtotal,
            status: ORDER_STATUSES.PENDING,
          },
        ],
        { session },
      );
    });
    return toOrderPayload(created);
  } finally {
    await session.endSession();
  }
}

/** Own order history, newest first. */
export async function listMyOrders(userId, query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = { user: userId };
  const [docs, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);
  return toPagedResult({ items: docs.map(toOrderPayload), total, page, limit });
}

/**
 * Owner-or-Admin view. Ownership is enforced in the query itself; a missing
 * or inaccessible order is uniformly 404 (no resource enumeration).
 */
export async function getOrderById(id, { userId, role }) {
  const filter = role === ROLES.ADMIN ? { _id: id } : { _id: id, user: userId };
  const order = await Order.findOne(filter);
  if (!order) {
    throw AppError.notFound('Order not found');
  }
  return toOrderPayload(order);
}

/** Admin: all orders, paginated newest-first, optional status/user filters. */
export async function listOrders(query = {}) {
  const { page, limit, skip } = parsePagination(query);
  const filter = {};
  if (query.status !== undefined) filter.status = query.status;
  if (query.user !== undefined) filter.user = query.user;
  const [docs, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Order.countDocuments(filter),
  ]);
  return toPagedResult({ items: docs.map(toOrderPayload), total, page, limit });
}

/**
 * Admin: move an order to a new status. Only documented transitions are
 * allowed (anything else is 409). Every update is conditional on the status
 * observed at read time, so concurrent transitions fail safe instead of
 * overwriting each other.
 *
 * Cancellation policy: exactly the map's cancellable set
 * (pending/confirmed/processing) may move to cancelled. Cancelling restores
 * each line's quantity to stock inside the same transaction as the status
 * change — retried/duplicate cancel requests hit the terminal state and get
 * 409, so stock is restored exactly once.
 */
export async function setOrderStatus(id, to) {
  const order = await Order.findById(id);
  if (!order) {
    throw AppError.notFound('Order not found');
  }
  const from = order.status;
  if (!canTransitionOrderStatus(from, to)) {
    throw AppError.conflict(`Cannot change order status from '${from}' to '${to}'`);
  }

  if (to === ORDER_STATUSES.CANCELLED) {
    return cancelOrderWithRestock(id, from);
  }

  const updated = await Order.findOneAndUpdate({ _id: id, status: from }, { status: to }, { returnDocument: 'after' });
  if (!updated) {
    throw AppError.conflict('Order status changed concurrently; please retry');
  }
  return toOrderPayload(updated);
}

async function cancelOrderWithRestock(id, from) {
  const session = await mongoose.startSession();
  try {
    let cancelled = null;
    await session.withTransaction(async () => {
      const claimed = await Order.findOneAndUpdate(
        { _id: id, status: from },
        { status: ORDER_STATUSES.CANCELLED },
        { session, returnDocument: 'after' },
      );
      if (!claimed) {
        throw AppError.conflict('Order status changed concurrently; please retry');
      }
      for (const item of claimed.items) {
        await Product.updateOne({ _id: item.product }, { $inc: { stock: item.quantity } }, { session });
      }
      cancelled = claimed;
    });
    return toOrderPayload(cancelled);
  } finally {
    await session.endSession();
  }
}
