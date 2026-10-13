import { pick } from '../../common/utils/pick.js';
import * as adminService from './admin.service.js';

export async function listUsers(req, res) {
  const query = pick(req.query, ['page', 'limit', 'role', 'isActive']);
  const data = await adminService.listUsers(query);
  res.status(200).json({ success: true, data });
}

export async function getUser(req, res) {
  const user = await adminService.getUserById(req.params.id);
  res.status(200).json({ success: true, data: { user } });
}

export async function setStatus(req, res) {
  const user = await adminService.setUserStatus(req.params.id, req.body.isActive, {
    actorId: req.user.id,
  });
  res.status(200).json({ success: true, data: { user } });
}
