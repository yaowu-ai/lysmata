import { useRef, useState, useEffect } from "react";
import { Send, AtSign, Square } from "lucide-react";
import type { Bot } from "../../shared/types";
import { cn } from "../../shared/lib/utils";

interface Props {
  bots: Bot[];
  onSend: (content: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  placeholder?: string;
}

export function MessageInput({ bots, onSend, onStop, disabled, placeholder }: Props) {
  const [value, setValue] = useState("");
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [focusIdx, setFocusIdx] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Track IME composition state to avoid sending mid-composition (e.g. Chinese input)
  const isComposingRef = useRef(false);

  const filteredBots = mention
    ? bots.filter((b) => b.name.toLowerCase().includes(mention.query.toLowerCase()))
    : [];

  function detectMention(v: string, cursorPos: number) {
    const before = v.slice(0, cursorPos);
    const m = before.match(/@(\w*)$/);
    if (m) {
      setMention({ query: m[1], start: cursorPos - m[0].length });
      setFocusIdx(0);
    } else {
      setMention(null);
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const v = e.target.value;
    setValue(v);
    autoResize(e.target);
    detectMention(v, e.target.selectionStart);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (mention && filteredBots.length > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIdx((i) => Math.min(i + 1, filteredBots.length - 1));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if ((e.key === "Enter" || e.key === "Tab") && !isComposingRef.current) {
        e.preventDefault();
        insertMention(filteredBots[focusIdx]);
        return;
      }
      if (e.key === "Escape") {
        setMention(null);
        return;
      }
    }
    // Only send when not composing (prevents firing during Chinese/Japanese IME selection)
    if (e.key === "Enter" && !e.shiftKey && !isComposingRef.current) {
      e.preventDefault();
      handleSend();
    }
  }

  function insertMention(bot: Bot) {
    if (!mention) return;
    const before = value.slice(0, mention.start);
    const after = value.slice(textareaRef.current?.selectionStart ?? mention.start);
    const newVal = `${before}@${bot.name} ${after}`;
    setValue(newVal);
    setMention(null);
    setTimeout(() => {
      textareaRef.current?.focus();
      const pos = before.length + bot.name.length + 2;
      textareaRef.current?.setSelectionRange(pos, pos);
    }, 0);
  }

  function handleSend() {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setValue("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.focus();
    }
    setMention(null);
  }

  function handleAtButtonClick() {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart ?? value.length;
    const newVal = value.slice(0, pos) + "@" + value.slice(pos);
    setValue(newVal);
    // Restore focus and cursor position after React re-renders
    setTimeout(() => {
      el.focus();
      el.setSelectionRange(pos + 1, pos + 1);
      detectMention(newVal, pos + 1);
    }, 0);
  }

  function autoResize(el: HTMLTextAreaElement) {
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 100) + "px";
  }

  // Close mention popup on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setMention(null);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const routingHint = (() => {
    const m = value.match(/@(\w+)/);
    if (!m) return null;
    const found = bots.find((b) => b.name.toLowerCase() === m[1].toLowerCase());
    return found ? `→ 将路由至 @${found.name}` : `→ 默认路由至主Bot`;
  })();

  return (
    <div className="px-5 py-3 bg-white border-t border-[#E5E7EB] flex-shrink-0">
      <div ref={containerRef} className="relative">
        {/* @mention popup */}
        {mention && filteredBots.length > 0 && (
          <div className="absolute bottom-full left-0 mb-2 w-72 bg-white border border-[#E5E7EB] rounded-[10px] shadow-[0_8px_24px_rgba(0,0,0,0.1)] z-50 overflow-hidden">
            <div className="px-3 py-1.5 border-b border-[#F1F5F9] text-[11px] text-[#94A3B8] font-semibold uppercase tracking-wider">
              选择 Bot
            </div>
            {filteredBots.map((bot, i) => (
              <div
                key={bot.id}
                onClick={() => insertMention(bot)}
                className={cn(
                  "flex items-center gap-2.5 px-3.5 py-2 cursor-pointer text-[14px] hover:bg-[#F8FAFC]",
                  i === focusIdx && "bg-[#EFF6FF]",
                )}
              >
                <div className="w-7 h-7 rounded-full bg-gradient-to-br from-blue-100 to-blue-200 flex items-center justify-center text-sm flex-shrink-0">
                  {bot.avatar_emoji}
                </div>
                <div>
                  <div className="font-semibold">@{bot.name}</div>
                  <div className="text-[11px] text-[#94A3B8]">
                    {bot.description?.slice(0, 40) || bot.connection_status}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Input area */}
        <div className="bg-[#F8FAFC] border border-[#E5E7EB] rounded-xl px-3.5 py-2.5 focus-within:border-[#93C5FD] focus-within:shadow-[0_0_0_3px_rgba(147,197,253,0.2)] transition-all">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              isComposingRef.current = true;
            }}
            onCompositionEnd={() => {
              isComposingRef.current = false;
            }}
            disabled={disabled}
            placeholder={placeholder ?? "发送消息… 输入 @ 可提及特定 Bot"}
            className="w-full border-none outline-none bg-transparent text-[14px] leading-[1.6] resize-none text-[#0F172A] caret-[#0F172A] placeholder:text-[#94A3B8] max-h-[100px] overflow-y-auto"
          />
          <div className="flex items-center justify-between mt-2">
            <div className="flex items-center gap-2">
              <button
                onClick={handleAtButtonClick}
                className="inline-flex items-center gap-1 text-[12px] font-medium text-[#64748B] bg-[#F1F5F9] border-none px-2.5 py-1 rounded-[6px] cursor-pointer hover:bg-[#E2E8F0] transition-colors"
              >
                <AtSign size={13} /> 提及 Bot
              </button>
              {routingHint && (
                <span
                  className={cn(
                    "text-[12px]",
                    routingHint.startsWith("→ 将路由至 @") ? "text-[#16A34A]" : "text-[#94A3B8]",
                  )}
                >
                  {routingHint}
                </span>
              )}
            </div>
            {disabled ? (
              <button
                onClick={onStop}
                className="w-[34px] h-[34px] rounded-lg bg-[#EF4444] flex items-center justify-center hover:bg-[#DC2626] active:scale-95 transition-all"
                title="停止生成"
              >
                <Square size={14} className="text-white fill-white" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!value.trim()}
                className="w-[34px] h-[34px] rounded-lg bg-[#2563EB] flex items-center justify-center hover:bg-[#1D4ED8] active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send size={15} className="text-white" />
              </button>
            )}
          </div>
        </div>
        <p className="text-[11px] text-[#CBD5E1] text-center mt-1.5">
          Enter 发送 · Shift+Enter 换行 · @ 触发 Bot 提及
        </p>
      </div>
    </div>
  );
}
