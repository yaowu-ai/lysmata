import { apiClient } from "../api-client";
import type {
  WorkspaceInitResult,
  WorkspaceTemplateMeta,
  WorkspaceTemplateSchema,
} from "../types";

export function fetchWorkspaceTemplates() {
  return apiClient.get<WorkspaceTemplateMeta[]>("/onboarding/workspace-templates");
}

export function fetchWorkspaceTemplateSchema(templateId: string) {
  return apiClient.get<WorkspaceTemplateSchema>(
    `/onboarding/workspace-initializer/schema?templateId=${encodeURIComponent(templateId)}`,
  );
}

export function applyWorkspaceTemplate(input: {
  templateId: string;
  assistantName: string;
  assistantGoal: string;
  toneStyle: string;
}) {
  return apiClient.post<WorkspaceInitResult>("/onboarding/workspace-initializer/apply", input);
}