import { z } from "zod";

export const UuidSchema = z.string().uuid();
export const LoginRequestSchema = z.object({
  username: z.string().trim().min(1).max(100),
  password: z.string().min(1).max(512),
});
export const RefreshRequestSchema = z.object({ refreshToken: z.string().min(20).max(512) });
export const SetActiveBranchRequestSchema = z.object({ branchId: UuidSchema });
export const BranchContextSchema = z.object({
  id: UuidSchema,
  name: z.string(),
  code: z.string(),
  settings: z.record(z.string(), z.unknown()),
});
export const AuthContextSchema = z.object({
  user: z.object({ id: UuidSchema, displayName: z.string() }),
  branches: z.array(BranchContextSchema).min(1),
  activeBranch: BranchContextSchema.nullable(),
  permissions: z.array(z.string()).readonly(),
});
export const SessionTokensSchema = z.object({
  accessToken: z.string(),
  accessTokenExpiresAt: z.string().datetime(),
  refreshToken: z.string(),
  refreshTokenExpiresAt: z.string().datetime(),
});
export const AuthenticatedContextSchema = AuthContextSchema.extend({ session: SessionTokensSchema });
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RefreshRequest = z.infer<typeof RefreshRequestSchema>;
export type SetActiveBranchRequest = z.infer<typeof SetActiveBranchRequestSchema>;
export type AuthContext = z.infer<typeof AuthContextSchema>;
export type AuthenticatedContext = z.infer<typeof AuthenticatedContextSchema>;
