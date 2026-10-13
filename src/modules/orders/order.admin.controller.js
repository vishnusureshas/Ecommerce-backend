import { pick } from '../../common/utils/pick.js';
import * as orderService from './order.service.js';

export async function listOrders(req, res) {
  const data = await orderService.listOrders(pick(req.query, ['page', 'limit', 'status', 'user']));
  res.status(200).json({ success: true, data });
}

export async function setStatus(req, res) {
  const { status } = pick(req.body, ['status']);
  const order = await orderService.setOrderStatus(req.params.id, status);
  res.status(200).json({ success: true, data: { order } });
}
