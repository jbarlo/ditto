import { z } from "zod";

export const canvasRoleSchema = z.enum(["viewer", "editor", "owner"]);
export type CanvasRole = z.infer<typeof canvasRoleSchema>;

const ROLE_LEVEL: Record<CanvasRole, number> = {
  viewer: 0,
  editor: 1,
  owner: 2,
};

export function hasMinRole(actual: CanvasRole, required: CanvasRole): boolean {
  return ROLE_LEVEL[actual] >= ROLE_LEVEL[required];
}
