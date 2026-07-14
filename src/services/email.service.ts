// Deliberately a stub for Stage 3. Isolating this in its own service means nothing else in
// the codebase needs to change when you plug in a real provider later.

export async function sendVerificationEmail(email: string, rawToken: string): Promise<void> {
  console.log(`[email:verify] To: ${email} | Link: /auth/verify-email/${rawToken}`);
}

export async function sendPasswordResetEmail(email: string, rawToken: string): Promise<void> {
  console.log(`[email:reset] To: ${email} | Link: /auth/reset-password/${rawToken}`);
}

export async function sendAdminInviteEmail(email: string, rawToken: string): Promise<void> {
  console.log(`[email:admin-invite] To: ${email} | Link: /auth/complete-admin-setup/${rawToken}`);
}