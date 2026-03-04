import { useState } from "react";
import { NavLink } from "react-router-dom";
import { Bot, MessageSquare, Users, Settings, ChevronLeft, ChevronRight, PanelLeft } from "lucide-react";
import { cn } from "../shared/lib/utils";

const mainNavItems = [
  { to: "/bots", icon: Bot, label: "Bot 管理" },
  { to: "/chat/private", icon: MessageSquare, label: "私聊" },
  { to: "/chat/group", icon: Users, label: "群聊" },
  { to: "/artifact", icon: PanelLeft, label: "Artifact 演示" },
];

const bottomNavItems = [
  { to: "/settings", icon: Settings, label: "设置" },
];

export function LeftNav() {
  const [expanded, setExpanded] = useState(false);

  return (
    <nav
      className={cn(
        "flex flex-col bg-white border-r border-[#E5E7EB] py-3 flex-shrink-0 z-10 overflow-hidden transition-all duration-[260ms] ease-[cubic-bezier(0.4,0,0.2,1)]",
        expanded ? "w-[220px]" : "w-16",
      )}
    >
      {/* Logo */}
      <div className="flex items-center px-[14px] mb-3.5 h-9 min-w-[220px]">
        <div className="w-9 h-9 rounded-[10px] bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-[0_2px_8px_rgba(37,99,235,0.30)]">
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="white"
            strokeWidth="2.2"
            strokeLinecap="round"
          >
            <path d="M12 2L4 7l8 5 8-5-8-5z" />
            <path d="M4 12l8 5 8-5" />
            <path d="M4 17l8 5 8-5" />
          </svg>
        </div>
        <span
          className={cn(
            "ml-2.5 font-bold text-[15px] text-[#0F172A] tracking-tight whitespace-nowrap overflow-hidden transition-all duration-[220ms] ease-in-out",
            expanded ? "opacity-100 max-w-[180px]" : "opacity-0 max-w-0",
          )}
        >
          Lysmata
        </span>
      </div>

      {/* 主导航区域 - 使用 flex-1 自动填充空间 */}
      <div className="flex flex-col gap-0.5 px-2.5 flex-1 min-w-[220px]">
        {mainNavItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center w-full rounded-[9px] p-1 transition-colors duration-[120ms] text-left no-underline",
                isActive
                  ? "bg-[#EFF6FF] text-blue-600"
                  : "text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569]",
              )
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={cn(
                    "w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-lg",
                    isActive ? "text-blue-600" : "",
                  )}
                >
                  <Icon size={18} />
                </div>
                <span
                  className={cn(
                    "text-[14px] font-medium whitespace-nowrap overflow-hidden transition-all duration-[180ms] ease-in-out",
                    expanded ? "opacity-100 max-w-[180px]" : "opacity-0 max-w-0",
                    isActive ? "text-blue-600" : "text-[#64748B]",
                  )}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}
      </div>

      {/* 底部区域 - 有分隔线 */}
      <div className="flex flex-col gap-0.5 px-2.5 border-t border-[#F1F5F9] pt-2 mt-1 min-w-[220px]">
        {/* 设置按钮 */}
        {bottomNavItems.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              cn(
                "flex items-center w-full rounded-[9px] p-1 transition-colors duration-[120ms] text-left no-underline",
                isActive
                  ? "bg-[#EFF6FF] text-blue-600"
                  : "text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569]",
              )
            }
          >
            {({ isActive }) => (
              <>
                <div
                  className={cn(
                    "w-9 h-9 flex items-center justify-center flex-shrink-0 rounded-lg",
                    isActive ? "text-blue-600" : "",
                  )}
                >
                  <Icon size={18} />
                </div>
                <span
                  className={cn(
                    "text-[14px] font-medium whitespace-nowrap overflow-hidden transition-all duration-[180ms] ease-in-out",
                    expanded ? "opacity-100 max-w-[180px]" : "opacity-0 max-w-0",
                    isActive ? "text-blue-600" : "text-[#64748B]",
                  )}
                >
                  {label}
                </span>
              </>
            )}
          </NavLink>
        ))}

        {/* 收起/展开按钮 */}
        <button
          onClick={() => setExpanded((v) => !v)}
          className="flex items-center w-full rounded-[9px] p-1 text-[#94A3B8] hover:bg-[#F1F5F9] hover:text-[#475569] transition-colors duration-[120ms]"
        >
          <div className="w-9 h-9 flex items-center justify-center flex-shrink-0">
            {expanded ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
          </div>
          <span
            className={cn(
              "text-[14px] font-medium text-[#64748B] whitespace-nowrap overflow-hidden transition-all duration-[180ms] ease-in-out",
              expanded ? "opacity-100 max-w-[180px]" : "opacity-0 max-w-0",
            )}
          >
            收起
          </span>
        </button>
      </div>
    </nav>
  );
}
