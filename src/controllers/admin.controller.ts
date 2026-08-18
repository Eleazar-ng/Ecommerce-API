import * as adminService from '../services/admin.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const inviteAdmin = asyncHandler(async (req, res) => {
  const admin = await adminService.inviteAdmin(req.body);
  res.status(201).json({ success: true, data: admin });
});

export const updatePermissions = asyncHandler(async (req, res) => {
  const result = await adminService.updateAdminPermissions(req.params.id, req.body.permissions);
  res.status(200).json({ success: true, data: result });
});

export const listAdmins = asyncHandler(async (req, res) => {
  const admins = await adminService.listAdmins();
  res.status(200).json({ success: true, data: admins });
});