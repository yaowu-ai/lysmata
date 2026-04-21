import { Bubble, ThoughtChain } from "@ant-design/x";
import type { ThoughtChainItemType } from "@ant-design/x/es/thought-chain/interface";

interface Props {
  items: ThoughtChainItemType[];
  /** Hide avatar and wrapper (useful when nested as `extra` of another bubble). */
  inline?: boolean;
  /** Shown as header title over the chain (e.g. "正在思考..."). */
  header?: React.ReactNode;
}

export function ThoughtChainBubble({ items, inline, header }: Props) {
  if (items.length === 0) return null;

  const chain = (
    <div className="thought-chain-body">
      {header && <div className="text-[12px] text-[#64748B] mb-2 font-medium">{header}</div>}
      <ThoughtChain items={items} line="dashed" />
    </div>
  );

  if (inline) return chain;

  return (
    <div className="msg-row flex items-start gap-2.5">
      <div className="w-[34px] h-[34px] rounded-full bg-gradient-to-br from-amber-50 to-amber-100 flex items-center justify-center text-[17px] flex-shrink-0 mt-0.5">
        🧠
      </div>
      <div className="max-w-[75%] min-w-0">
        <Bubble
          placement="start"
          variant="outlined"
          shape="corner"
          content={chain}
          classNames={{ content: "!bg-white" }}
        />
      </div>
    </div>
  );
}
