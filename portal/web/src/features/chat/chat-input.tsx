import { CHAT_MESSAGE_MAX_LENGTH } from "@translog/contracts";
import { SendHorizontal } from "lucide-react";
import { type FormEvent, type KeyboardEvent, useRef, useState } from "react";

interface ChatInputProps {
  disabled: boolean;
  onSend: (text: string) => void;
}

export function ChatInput({ disabled, onSend }: ChatInputProps) {
  const [text, setText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function resetHeight() {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
    }
  }

  function handleChange(value: string) {
    setText(value);
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
    }
  }

  function submitCurrent() {
    const trimmed = text.trim();
    if (!trimmed || disabled) {
      return;
    }
    setText("");
    resetHeight();
    onSend(trimmed);
  }

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    submitCurrent();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submitCurrent();
    }
  }

  return (
    <div className="shrink-0 border-t border-slate-200 bg-slate-50/40 p-3">
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2 rounded-md border border-slate-300 bg-white p-1.5 focus-within:ring-2 focus-within:ring-primary/20 focus-within:border-primary transition"
      >
        <textarea
          ref={textareaRef}
          rows={1}
          maxLength={CHAT_MESSAGE_MAX_LENGTH}
          value={text}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Pergunte quando chega, por que atrasou…"
          className="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-5 placeholder:text-slate-400 focus:outline-none max-h-32 scroll-thin"
        />
        <button
          type="submit"
          aria-label="Enviar"
          disabled={disabled || !text.trim()}
          className="w-8 h-8 shrink-0 rounded bg-primary text-white grid place-items-center hover:bg-primary-700 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed transition"
        >
          <SendHorizontal className="w-4 h-4" />
        </button>
      </form>
      <div className="mt-1.5 px-1 flex items-center justify-between">
        <p className="font-mono text-[10.5px] text-slate-400">
          Enter envia · Shift+Enter quebra linha
        </p>
        <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400">
          Canal oficial
        </span>
      </div>
    </div>
  );
}
