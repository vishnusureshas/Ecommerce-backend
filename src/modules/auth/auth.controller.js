import { pick } from '../../common/utils/pick.js';
import * as authService from './auth.service.js';

export async function register(req, res) {
  // Allowlist: role/isActive/passwordHash can never be mass-assigned here.
  const input = pick(req.body, ['name', 'email', 'password']);
  const data = await authService.register(input);
  res.status(201).json({ success: true, data });
}

export async function login(req, res) {
  const input = pick(req.body, ['email', 'password']);
  const data = await authService.login(input);
  res.status(200).json({ success: true, data });
}
