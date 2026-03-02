import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";

interface Props {
  content: string;
}

function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  }

  return (
    <button
      onClick={handleCopy}
      className="text-[11px] px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-[#94A3B8] hover:text-white transition-colors"
    >
      {copied ? "已复制" : "复制"}
    </button>
  );
}

export function MarkdownContent({ content }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[rehypeHighlight]}
      components={{
        // Fenced code blocks
        pre({ children, ...props }) {
          // Extract code text for copy button
          const codeEl = (children as React.ReactElement<{ children?: string; className?: string }>)?.props;
          const codeText = typeof codeEl?.children === "string" ? codeEl.children : "";
          const lang = codeEl?.className?.replace("language-", "") ?? "";

          return (
            <div className="relative group my-2 rounded-lg overflow-hidden">
              <div className="flex items-center justify-between px-3 py-1.5 bg-[#1E293B] border-b border-white/10">
                <span className="text-[11px] text-[#64748B] font-mono">{lang || "code"}</span>
                <CopyButton code={codeText} />
              </div>
              <pre
                {...props}
                className="m-0 rounded-none text-[13px] leading-[1.6] overflow-x-auto bg-[#1E293B] px-4 py-3"
              >
                {children}
              </pre>
            </div>
          );
        },
        // Inline code
        code({ children, className, ...props }) {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          }
          return (
            <code
              className="bg-[#F1F5F9] text-[#0F172A] font-mono text-[0.85em] px-1.5 py-0.5 rounded"
              {...props}
            >
              {children}
            </code>
          );
        },
        // Headings
        h1({ children }) {
          return <h1 className="text-[18px] font-bold mt-3 mb-1.5 text-[#0F172A]">{children}</h1>;
        },
        h2({ children }) {
          return <h2 className="text-[16px] font-bold mt-2.5 mb-1 text-[#0F172A]">{children}</h2>;
        },
        h3({ children }) {
          return <h3 className="text-[14px] font-semibold mt-2 mb-1 text-[#0F172A]">{children}</h3>;
        },
        // Paragraph
        p({ children }) {
          return <p className="my-1 leading-[1.65]">{children}</p>;
        },
        // Lists
        ul({ children }) {
          return <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>;
        },
        ol({ children }) {
          return <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>;
        },
        li({ children }) {
          return <li className="text-[14px]">{children}</li>;
        },
        // Blockquote
        blockquote({ children }) {
          return (
            <blockquote className="border-l-[3px] border-[#CBD5E1] pl-3 my-2 text-[#475569] italic">
              {children}
            </blockquote>
          );
        },
        // Table
        table({ children }) {
          return (
            <div className="overflow-x-auto my-2">
              <table className="w-full text-[13px] border-collapse">{children}</table>
            </div>
          );
        },
        thead({ children }) {
          return <thead className="border-b-2 border-[#E2E8F0]">{children}</thead>;
        },
        th({ children }) {
          return <th className="px-3 py-1.5 text-left font-semibold text-[#374151]">{children}</th>;
        },
        td({ children }) {
          return <td className="px-3 py-1.5 border-b border-[#F1F5F9]">{children}</td>;
        },
        tr({ children }) {
          return <tr className="even:bg-[#F8FAFC]">{children}</tr>;
        },
        // Horizontal rule
        hr() {
          return <hr className="my-3 border-[#E5E7EB]" />;
        },
        // Strong / Em
        strong({ children }) {
          return <strong className="font-semibold text-[#0F172A]">{children}</strong>;
        },
        em({ children }) {
          return <em className="italic">{children}</em>;
        },
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
