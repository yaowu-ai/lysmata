import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  applyWorkspaceTemplate,
  getWorkspaceTemplateSchema,
  listWorkspaceTemplates,
} from "../../core/openclaw-workspace-markdown";

const app = new Hono();

const templateIdSchema = z.enum(["export-owner", "equipment-rental", "platform-ops"]);

app.get("/workspace-templates", (c) => {
  return c.json(listWorkspaceTemplates());
});

app.get("/workspace-initializer/schema", (c) => {
  const templateId = c.req.query("templateId");
  if (!templateIdSchema.safeParse(templateId).success) {
    return c.json({ error: "Invalid templateId" }, 400);
  }

  return c.json(getWorkspaceTemplateSchema(templateId));
});

app.post(
  "/workspace-initializer/apply",
  zValidator(
    "json",
    z.object({
      templateId: templateIdSchema,
      assistantName: z.string().min(1).max(40),
      assistantGoal: z.string().min(1).max(200),
      toneStyle: z.string().min(1).max(120),
    }),
  ),
  async (c) => {
    const result = await applyWorkspaceTemplate(c.req.valid("json"));
    return c.json(result, 201);
  },
);

export default app;