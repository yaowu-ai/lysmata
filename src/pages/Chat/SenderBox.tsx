import { Sender } from "@ant-design/x";
import { AtSign } from "lucide-react";
import { useRef } from "react";
import type { ReactNode } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (content: string) => void;
  onStop?: () => void;
  loading?: boolean;
  disabled?: boolean;
  placeholder?: string;
  onPasteFile?: (files: FileList) => void;
  /** Extra node rendered left of the send button (e.g. @mention trigger). */
  prefix?: ReactNode;
  /** Small footer hint line under the input. */
  footer?: ReactNode;
}

/**
 * Wraps `@ant-design/x` Sender with the project's interaction contract:
 * - Enter sends, Shift+Enter newlines, IME composition is handled by Sender.
 * - `loading=true` switches the send button to a Stop (calls `onStop` via `onCancel`).
 * - Paste / drag-drop file events are forwarded via `onPasteFile`.
 * - `prefix` lets callers inject extra controls (e.g. @mention trigger) on the
 *   left of the action row.
 */
export function SenderBox({
  value,
  onChange,
  onSubmit,
  onStop,
  loading,
  disabled,
  placeholder,
  onPasteFile,
  prefix,
  footer,
}: Props) {
  const lastSentRef = useRef("");

  const handleSubmit = (message: string) => {
    const trimmed = message.trim();
    if (!trimmed || disabled) return;
    // Guard against duplicate submits from browsers that fire onSubmit twice.
    if (trimmed === lastSentRef.current && loading) return;
    lastSentRef.current = trimmed;
    onSubmit(trimmed);
    onChange("");
  };

  return (
    <Sender
      value={value}
      onChange={(next) => onChange(next)}
      onSubmit={handleSubmit}
      onCancel={onStop}
      loading={loading}
      disabled={disabled}
      placeholder={placeholder ?? "发送消息… 输入 @ 可提及特定 Bot"}
      autoSize={{ minRows: 1, maxRows: 6 }}
      onPasteFile={onPasteFile}
      prefix={prefix}
      footer={footer}
    />
  );
}

/** Default @-button prefix — renders a chip that inserts '@' at the caret. */
export function MentionPrefix({ onTrigger }: { onTrigger: () => void }) {
  return (
    <button
      type="button"
      onClick={onTrigger}
      className="inline-flex items-center gap-1 text-[12px] font-medium text-[#64748B] bg-[#F1F5F9] px-2.5 py-1 rounded-[6px] hover:bg-[#E2E8F0] transition-colors"
    >
      <AtSign size={13} /> 提及 Bot
    </button>
  );
}
