import type { useToast } from "../../components/Toast";

// 工具函数：复制到剪贴板
export async function copyToClipboard(text: string, toast: ReturnType<typeof useToast>) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("API Key 已复制到剪贴板");
  } catch {
    toast.error("复制失败");
  }
}
