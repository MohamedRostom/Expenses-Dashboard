import { z } from 'zod';

/** Shape of the `user` object returned by auth and /me endpoints. */
export const UserResponse = z.object({
  id: z.string(),
  email: z.string(),
  defaultCurrency: z.string(),
  theme: z.string(),
  timeZone: z.string(),
  onboardingCompletedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type UserResponseT = z.infer<typeof UserResponse>;

export const RegisterRequest = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(12).max(128),
  defaultCurrency: z.string().length(3),
  timeZone: z.string(),
});
export type RegisterRequestT = z.infer<typeof RegisterRequest>;

export const VerifyRequest = z.object({ token: z.string() });
export type VerifyRequestT = z.infer<typeof VerifyRequest>;
export const VerifyResponse = z.object({ user: UserResponse });
export type VerifyResponseT = z.infer<typeof VerifyResponse>;

export const LoginRequest = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string(),
});
export type LoginRequestT = z.infer<typeof LoginRequest>;
export const LoginResponse = z.object({ user: UserResponse });
export type LoginResponseT = z.infer<typeof LoginResponse>;

export const ForgotPasswordRequest = z.object({ email: z.string().email().toLowerCase().trim() });
export type ForgotPasswordRequestT = z.infer<typeof ForgotPasswordRequest>;

export const ResetPasswordRequest = z.object({
  token: z.string(),
  password: z.string().min(12).max(128),
});
export type ResetPasswordRequestT = z.infer<typeof ResetPasswordRequest>;
