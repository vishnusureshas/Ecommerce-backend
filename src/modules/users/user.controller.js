import { pick } from '../../common/utils/pick.js';
import * as userService from './user.service.js';

export async function getMe(req, res) {
  const user = await userService.getMe(req.user.id);
  res.status(200).json({ success: true, data: { user } });
}

export async function updateMe(req, res) {
  const input = pick(req.body, ['name', 'currentPassword', 'newPassword']);
  const user = await userService.updateMe(req.user.id, input);
  res.status(200).json({ success: true, data: { user } });
}
