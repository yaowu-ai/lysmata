import type { ComponentProps } from "@ant-design/x-markdown";
import { XMarkdown } from "@ant-design/x-markdown";
import Latex from "@ant-design/x-markdown/plugins/Latex";
import "@ant-design/x-markdown/themes/light.css";
import CodeHighlighter from "@ant-design/x/es/code-highlighter";
import Mermaid from "@ant-design/x/es/mermaid";

interface Props {
  content: string;
  isStreaming?: boolean;
}

function CodeBlock(props: ComponentProps) {
  const { block, lang, children } = props;
  const text = typeof children === "string" ? children : String(children ?? "");

  if (!block) {
    return (
      <code className="bg-[#F1F5F9] text-[#0F172A] font-mono text-[0.85em] px-1.5 py-0.5 rounded">
        {text}
      </code>
    );
  }

  if (lang === "mermaid") {
    return <Mermaid>{text}</Mermaid>;
  }

  return <CodeHighlighter lang={lang || "text"}>{text}</CodeHighlighter>;
}

const LATEX_EXTENSIONS = { extensions: Latex() };

export function MarkdownContent({ content, isStreaming = false }: Props) {
  return (
    <XMarkdown
      content={content}
      config={LATEX_EXTENSIONS}
      streaming={{
        hasNextChunk: isStreaming,
        enableAnimation: isStreaming,
        tail: isStreaming,
      }}
      className="lys-markdown x-markdown-light"
      components={{
        code: CodeBlock,
      }}
    />
  );
}
