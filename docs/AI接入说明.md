# 文字 AI 接入说明

日期：2026-11-04。

## 当前状态

- 已部署事件云函数 `diudiu-ai`，运行时 Nodejs18.15，SDK 固定为 `@cloudbase/node-sdk@3.18.7`。
- 浏览器使用本地分发的官方 `@cloudbase/js-sdk@3.11.0`；不从 CDN 动态加载依赖。
- 已增加文字共鸣、建议、结构化烦恼提炼的前后端调用代码、登录、明确发送同意、失败重试与过期结果丢弃。
- 图片和录音暂不上传，不进行 OCR、转写或语义分析。网络检索仍未接入，回复不会假称有网络来源。
- 云函数已运行并验证未登录调用返回 `AUTH_REQUIRED`；已在授权的 CloudBase 托管预览中验证普通账号真实登录及云函数往返，返回 `configured: false`。尚未取得可用的独立模型配置，**没有完成真实模型请求，不宣称接入成功**。

## 为什么当前还不能生成真实回复

实际环境为体验版 `baas_trial`。平台在启用 CloudBase 内置文字模型时明确返回“当前环境的套餐不支持，请升级到标准版及以上套餐”。新增本地安全域名也被套餐限制拒绝。

用户已选择保留体验版，因此接入层改为：浏览器登录 → CloudBase 事件云函数 → 独立模型服务商的 HTTPS Chat Completions 接口。

用户后续提供的 `https://diudiu-d4gfzywne315e65b5.api.tcloudbasegateway.com/v1/ai/cloudbase` 是 CloudBase 自身的内置 AI 入口，并不是独立服务商。转发到它仍受原套餐与模型启用权限限制，不能用作绕过限制的方案。

后续需提供一个独立模型的 Base URL 和准确模型名，并在云端配置密钥；或者由用户自行升级 CloudBase 后另行适配其内置模型。没有自动购买资源包、变更套餐或开启超限付费。

## 云端模型配置

在 CloudBase 控制台进入 `diudiu` 环境 → 云函数 → `diudiu-ai` → 环境变量，填写：

- `LLM_BASE_URL`：独立模型服务商的 HTTPS Base URL，通常到 `/v1`，代码会补 `/chat/completions`；也接受完整 Chat Completions URL。
- `LLM_MODEL`：服务商实际支持的准确模型名。
- `LLM_API_KEY`：该服务商的私钥，**只在云端填写，不发聊天、不写前端、不提交 GitHub**。

当前适配 Chat Completions 格式。如果服务只支持其他协议，需要明确适配后再调用。模型接口地址由云端配置固定，客户端不能传入任意目标 URL。

代码没有默认模型或测试私钥；缺少配置时返回 `NOT_CONFIGURED`，不会降级成预设安慰话术。

## 登录与浏览器配置

腾讯云控制台登录与产品里的应用用户登录是两套身份。当前已开启应用用户名密码登录，没有为规避权限而开启匿名登录。

普通应用开发账号 `diudiu-dev` 已经用户明确授权创建，且真实登录验证通过。随机密码仅存本机 `.local/application-account.json`，不进入仓库或静态构建。账号没有授予管理员角色。

`web/cloudbase-config.json` 为本机生成的浏览器连接配置，已被 Git 忽略；它只包含环境 ID、地域、Publishable Key 和云函数名，不包含模型私钥。Publishable Key 可在浏览器使用，但不能替代用户登录或作为模型服务商私钥。

其他机器从 `web/cloudbase-config.example.json` 准备配置，或设置 `CLOUDBASE_ENV_ID`、`CLOUDBASE_REGION`、`CLOUDBASE_PUBLISHABLE_KEY` 后运行：

```sh
node scripts/configure-cloudbase.mjs
```

构建会将浏览器连接配置包含在静态产物中，这是浏览器 SDK 所需的公开配置；云端 `LLM_API_KEY` 不参与构建。

体验版当前不允许新增 `localhost:4173` 或 `127.0.0.1:4173` 安全域名。本地可以使用释放功能和检查界面；真实登录/云函数联调需使用环境已放行的托管域名或用户后续开通的域名，不能通过关闭鉴权、伪造登录态来绕过。

用户已授权公开发布至 [CloudBase 预览](https://diudiu-d4gfzywne315e65b5-1524741572.tcloudbaseapp.com/diudiu-ai-preview/)。首次打开测试域名会显示平台访问提示，等待后点击“确定访问”进入应用。预览包含静态 Web、原设计素材与文档，不包含私钥或账号密码。

## 关键行为

- 输入后先选回应方向，不自动请求。
- 共鸣和建议各有服务端提示词；请求中不能注入 `system` 角色。
- 静默收集不发送文字到模型，不提前提炼；只有主动“说完了”或请求整理才发送。
- 服务端要求 `summarize` 带明确完成标记；响应先校验事件与最多 16 字的候选重点，再由用户确认。
- 客户端 payload 只提取文字与本次主动选用的背景，不带图片、音频、对象 URL 或全部背景列表。
- 切换意图、退出、清空内容、离开页面时，后到结果不会写回当前流程。
- “停止等待”只停止界面等待，已经开始的云端调用可能仍会执行，不宣称已经取消供应商计费。
- 错误分支明确显示授权、配置、超时、限流或不可用，不冒充真实回复。

## 限制与数据处理

单段文字上限 4000 字，本次上下文总计最多 20000 字、40 条消息，背景最多 500 字，输出 `max_tokens=1000`，上游请求 45 秒超时。

每用户每分钟 6 次为单函数实例内的保护；相同请求 ID 的同内容调用在同实例内去重并短暂缓存，最长两分钟。它不是跨实例的全局预算系统，不承诺硬性日额度。公开扩大使用前需要增加分布式限流、预算和账号运营方案。

本项目不将对话写入云端数据库。云函数进程会为去重短暂保留结果；云平台的运行日志和模型供应商可能按各自规则保存处理记录，不能宣传为绝对无痕。本地删除不等同于删除供应商日志或账号。

## 验证

- `npm test`：12 项单元测试，覆盖权限、静默边界、提炼校验、文本隔离、错误不泄密、去重、限流与过期结果。
- `tests/browser-ai.mjs`：受控测试桩验证发送同意、静默无请求、切方向后旧结果不显示、错误不回退演示、重试、显式提炼。测试桩只存在测试路由，生产不会导入或生成假登录。
- 原三种释放玩法与合成媒体回归已重跑通过。
- `tests/live-cloudbase.mjs` 已验证真实用户名密码登录成功、获得真实会话并调用 `diudiu-ai` 状态接口成功，返回 `configured: false`。官方 SDK 外部依赖经 esbuild 打包，锁文件和依赖许可已保留。`usage.totalTokens > 0` 的模型往返要在有效模型配置后运行，测试桩不替代此项。

## 参考

- [CloudBase 云函数访问控制](https://docs.cloudbase.net/cloud-function/security-rules)
- [CloudBase 当前模型接入与套餐说明](https://docs.cloudbase.net/ai/model/overview)
- [CloudBase 模型迁移说明](https://docs.cloudbase.net/faq/knowledge/ai-model-migration-after-token-package)
