⏺ 好了，hermes 三个 SSE 接口的事件全摸清了。下面是完整盘点 + 我们项目支持情况：

Hermes 全部 SSE 事件清单

接口 ① POST /v1/chat/completions — 我们 hermes-adapter 当前用的接口

事件: data: {role chunk}  
 位置: api_server.py:1322-1328  
 payload 关键字段: OpenAI role delta
我们支持？: ✅ 走 OpenAI 兼容分支（hermes-adapter.ts:178-190），但首块没文本会被忽略
────────────────────────────────────────
事件: data: {content chunk}
位置: api_server.py:1347-1353
payload 关键字段: choices[0].delta.content
我们支持？: ✅ hermes-adapter.ts:178-190
────────────────────────────────────────
事件: event: hermes.tool.progress (status=running)  
 位置: api_server.py:1109-1133+1342-1346
payload 关键字段: tool、emoji、label、toolCallId、status:"running"  
 我们支持？: ⚠️ 部分支持：被吞进 process 分支，没识别 status=running 该转成
tool_call；callId
字段名匹配不上（hermes 发 toolCallId，我们找 call_id/callId/id）
────────────────────────────────────────
事件: event: hermes.tool.progress (status=completed)
位置: api_server.py:1135-1149+1342-1346
payload 关键字段: tool、toolCallId、status:"completed"
我们支持？: ⚠️ 部分支持：同样被吞进 process，没转成 tool_result
────────────────────────────────────────
事件: data: {finish chunk}
位置: api_server.py:1391-1402
payload 关键字段: finish_reason:"stop"、usage
我们支持？: ❌ 未识别：会被当成普通 chunk 解析（无 delta.content 直接忽略，不算坏，但 usage

    信息丢了）

────────────────────────────────────────
事件: data: [DONE]
位置: api_server.py:1403, 1434
payload 关键字段: 流结束标记
我们支持？: ✅ hermes-adapter.ts:108
────────────────────────────────────────
事件: data: {error chunk}
位置: api_server.py:1428-1433
payload 关键字段: finish_reason:"error"
我们支持？: ❌ 未识别：跟 finish chunk 同样处理路径，错误状态被吞
────────────────────────────────────────
事件: : keepalive\n\n
位置: api_server.py:1374
payload 关键字段: SSE comment
我们支持？: ✅ 注释行天然跳过

⚠️ adapter 里 hermes.tool.start / hermes.tool.end
两个分支（hermes-adapter.ts:127-147）永远不会触发 —— hermes 根本不发这俩 event 名。

---

接口 ② POST /v1/responses — OpenAI Responses API

┌────────────────────────────────────┬─────────────────────────┬──────────────────────┐
│ 事件 │ 位置 │ 我们支持？ │
├────────────────────────────────────┼─────────────────────────┼──────────────────────┤
│ event: response.created │ api_server.py:1606-1609 │ ❌ 未实现（adapter │
│ │ │ 没调这个接口） │
├────────────────────────────────────┼─────────────────────────┼──────────────────────┤  
 │ event: response.output_item.added │ api_server.py:1629-1633 │ ❌ │
│ (message) │ │ │  
 ├────────────────────────────────────┼─────────────────────────┼──────────────────────┤
│ event: response.output_text.delta │ api_server.py:1638-1645 │ ❌ │
├────────────────────────────────────┼─────────────────────────┼──────────────────────┤
│ event: response.output_text.done │ api_server.py:1866-1873 │ ❌ │
├────────────────────────────────────┼─────────────────────────┼──────────────────────┤
│ event: response.output_item.added │ api_server.py:1686-1690 │ ❌ │
│ (function_call) │ │ │
├────────────────────────────────────┼─────────────────────────┼──────────────────────┤
│ event: response.output_item.done │ api_server.py:1719-1723 │ ❌ │
│ (function_call) │ │ │
├────────────────────────────────────┼─────────────────────────┼──────────────────────┤
│ event: response.output_item.added │ api_server.py:1742-1746 │ ❌ │
│ (function_call_output) │ │ │
├────────────────────────────────────┼─────────────────────────┼──────────────────────┤
│ event: response.output_item.done │ api_server.py:1747-1751 │ ❌ │
│ (function_call_output) │ │ │
├────────────────────────────────────┼─────────────────────────┼──────────────────────┤
│ event: response.output_item.done │ api_server.py:1883-1887 │ ❌ │
│ (message) │ │ │
├────────────────────────────────────┼─────────────────────────┼──────────────────────┤
│ event: response.completed │ api_server.py:1971+ │ ❌ │
├────────────────────────────────────┼─────────────────────────┼──────────────────────┤
│ event: response.failed │ api_server.py:1948+, │ ❌ │
│ │ 2026+ │ │
└────────────────────────────────────┴─────────────────────────┴──────────────────────┘

---

接口 ③ GET /v1/runs/{run_id}/events — 异步 Run SSE（无 event: 名，全部 data: JSON）

┌───────────────┬─────────────────────────┬────────────────┬───────────────────────────┐
│ event 字段 │ 位置 │ payload │ 我们支持？ │
├───────────────┼─────────────────────────┼────────────────┼───────────────────────────┤
│ tool.started │ api_server.py:2775-2782 │ tool、preview │ ❌ │
├───────────────┼─────────────────────────┼────────────────┼───────────────────────────┤
│ tool.complete │ api_server.py:2783-2791 │ tool、duration │ ❌ │
│ d │ │ 、error │ │
├───────────────┼─────────────────────────┼────────────────┼───────────────────────────┤
│ reasoning.ava │ api_server.py:2792-2798 │ text │ ❌ │
│ ilable │ │ │ │
├───────────────┼─────────────────────────┼────────────────┼───────────────────────────┤
│ approval.requ │ │ choices、appro │ ❌ adapter setPushHandler │
│ est │ api_server.py:2929-2935 │ val data │ 是空实现（hermes-adapter │
│ │ │ │ .ts:195-203） │
├───────────────┼─────────────────────────┼────────────────┼───────────────────────────┤
│ approval.resp │ api_server.py:3232-3238 │ choice、resolv │ ❌ │
│ onded │ │ ed │ │
├───────────────┼─────────────────────────┼────────────────┼───────────────────────────┤  
 │ run.completed │ api_server.py:3014-3020 │ output、usage │ ❌ │
├───────────────┼─────────────────────────┼────────────────┼───────────────────────────┤  
 │ run.failed │ api_server.py:3001-3005 │ error │ ❌ │
│ │ 、3052-3057 │ │ │
├───────────────┼─────────────────────────┼────────────────┼───────────────────────────┤
│ run.cancelled │ api_server.py:3035-3039 │ — │ ❌ │
└───────────────┴─────────────────────────┴────────────────┴───────────────────────────┘
