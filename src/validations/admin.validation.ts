import { z } from 'zod';
import { AVAILABLE_PERMISSIONS } from '../services/admin.service.js';

export const inviteAdminSchema = z.object({
  body: z.object({
    email: z.email(),
    username: z
      .string()
      .min(3)
      .max(30)
      .regex(/^[a-zA-Z0-9_.-]+$/),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    permissions: z.array(z.enum(AVAILABLE_PERMISSIONS)).default([]),
  }),
});

export const updatePermissionsSchema = z.object({
  params: z.object({
    id: z.string().min(1),
  }),
  body: z.object({
    permissions: z.array(z.enum(AVAILABLE_PERMISSIONS)),
  }),
});

export type InviteAdminInput = z.infer<typeof inviteAdminSchema>['body'];