import { z } from 'zod';

// Shared password rule — deliberately not overly strict (no forced special-character
// gymnastics, which pushes users toward predictable substitutions like "P@ssw0rd"). Length
// is the strongest practical signal for password strength.
const passwordSchema = z.string()
.min(8, 'Password must be at least 8 characters')
.regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,'Password must contain at least one uppercase letter, one lowercase letter, and one number');

export const signupSchema = z.object({
  body: z.object({
    email: z.email(),
    username: z
      .string()
      .min(3, 'Username must be at least 3 characters')
      .max(30)
      .regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, . _ -'),
    password: passwordSchema,
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    // NOTE: `role` is deliberately NOT accepted here. The service layer never reads role
    // from input for signup regardless — documented so the omission reads as intentional.
  }),
});

export const loginSchema = z.object({
  body: z.object({
    identifier: z.string().min(1, 'Email or username is required'),
    password: z.string().min(1),
  }),
});

export const googleAuthSchema = z.object({
  body: z.object({
    idToken: z.string().min(1),
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.email(),
  }),
});

export const resetPasswordSchema = z.object({
  params: z.object({
    token: z.string().min(1),
  }),
  body: z.object({
    password: passwordSchema,
  }),
});

export const completeAdminSetupSchema = z.object({
  params: z.object({
    token: z.string().min(1),
  }),
  body: z.object({
    password: passwordSchema,
  }),
});

export const verifyEmailSchema = z.object({
  params: z.object({
    token: z.string().min(1),
  }),
});

export type SignupInput = z.infer<typeof signupSchema>['body'];
export type LoginInput = z.infer<typeof loginSchema>['body'];