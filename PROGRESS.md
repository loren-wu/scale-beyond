# 《尺度之外》项目进度

> 每次会话开始前先读取本文件；完成任何可独立交付的一部分后，立即更新本文件，避免重新连接后重复分析整个项目。

## 当前阶段

- 阶段：MVP
- 状态：MVP 层级 1-3 初版已实现、完成浏览器验证，并已创建本地 Git 初始提交；准备推送到 GitHub
- 最近更新：2026-06-29

## 已完成的层级

- 项目进度文件：已建立，每次会话需先读本文件
- 源稿梳理：已读取《尺度之外》V3 合并定稿，并确认第一阶段只做层级 1-3（`scaleValue` 0-800）
- MVP 工程入口：已将旧桌面 AR 原型替换为全屏 3D 体验容器
- MVP 交互骨架：已实现滚轮缩放、左键拖拽视角、缩放/拖拽阻尼
- MVP 层级 1-2 初版：已实现程序化地球球体、云层球体、大气 Fresnel Shader
- MVP 层级 3 初版：已实现太阳、月球、至少 4 个主要行星、轨道线与太阳系淡入
- MVP UI 初版：已实现项目名、当前尺度、尺度单位、核心文案、操作提示、缩放进度条
- MVP 浏览器验证：`http://localhost:4173/` 可打开，桌面端 canvas 非空、控制台无错误；滚轮缩放后 `scrollY` 保持 0，尺度可切换到 Solar System；手机宽度 390×844 下 canvas 铺满且 UI 未溢出
- Git 本地仓库：已初始化 `main` 分支，已创建初始提交 `Initial Scale Beyond MVP`

## 当前卡住的问题

- 真实 NASA 地球/云层/月球/行星贴图尚未接入；当前为程序化纹理和材质，后续需要下载或放入授权明确的素材并记录来源
- 当前仍是单文件 `main.js` 实现；MVP 稳定后可按源稿建议拆成 `camera/`、`controls/`、`layers/`、`ui/`
- 太阳系半径/距离压缩、相机距离和 FOV 仍需通过实机画面继续试调
- GitHub 仓库地址已提供：`https://github.com/loren-wu/scale-beyond.git`；本地尚未添加 remote，也尚未推送

## 下一步

1. 添加 GitHub remote 并推送当前 MVP 到 `https://github.com/loren-wu/scale-beyond.git`。
2. 接入真实 NASA 贴图并建立素材来源记录。
3. 继续试调太阳系半径/距离压缩、相机距离和 FOV。
4. MVP 稳定后再考虑按源稿建议拆分 `main.js`。

## 更新日志

- 2026-06-29：创建进度文件，初始化为 MVP 起步状态。
- 2026-06-29：读取源稿，确认 MVP 范围为层级 1-3；替换旧 AR 原型，完成 Three.js MVP 初版结构与交互。
- 2026-06-29：完成桌面与手机宽度浏览器验证，确认 canvas 渲染、滚轮缩放、拖拽、无页面滚动；记录 GitHub 接入待办。
- 2026-06-29：初始化本地 Git 仓库，分支改为 `main`，首个提交为 `Initial Scale Beyond MVP`；旧原型图片和 `.agents/` 已通过 `.gitignore` 排除。
- 2026-06-29：收到 GitHub 仓库地址 `https://github.com/loren-wu/scale-beyond.git`，准备添加 remote 并推送。
