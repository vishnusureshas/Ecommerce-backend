import { pick } from '../../common/utils/pick.js';
import * as orderService from './order.service.js';

export async function createOrder(req, res) {
  // Only the item list is accepted; prices/totals/status always come from the server.
  const { items = [] } = pick(req.body, ['items']);
  const order = await orderService.createOrder(req.user.id, items);
  res.status(201).json({ success: true, data: { order } });
}

export async function listMyOrders(req, res) {
  const data = await orderService.listMyOrders(req.user.id, pick(req.query, ['page', 'limit']));
  res.status(200).json({ success: true, data });
}

export async function getOrder(req, res) {
  const order = await orderService.getOrderById(req.params.id, {
    userId: req.user.id,
    role: req.user.role,
  });
  res.status(200).json({ success: true, data: { order } });
}
