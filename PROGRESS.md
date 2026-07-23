# 《尺度之外》项目进度

> 每次继续本项目时先读本文件。完成可独立交付的检查点后更新这里，避免下次重新分析整个仓库。

## 当前阶段

- 阶段：第六阶段 · 电影级连续转场、近实时高清地球与银河真实性升级
- 状态：`scale-cosmic6` 已完成主体开发、银河二次精修、桌面 / 手机七段验收，并发布到 GitHub Pages
- 最近更新：2026-07-23
- 项目：纯静态 HTML / CSS / JavaScript + Three.js `0.165.0`，无构建步骤
- 仓库：`https://github.com/loren-wu/scale-beyond.git`
- 线上地址：`https://loren-wu.github.io/scale-beyond/`

## 当前七段旅程

1. `01 · NEAR-EARTH ORBIT`：桌面 5400×2700 NASA Blue Marble 地貌底图、GIBS 近实时卫星影像、Black Marble、实时昼夜、云层、海洋高光、大气散射与极光。
2. `02 · EARTH IN VIEW`：完整地球、当前 UTC 晨昏线、最新可用每日真彩卫星影像与纪录片式尺度读数。
3. `03 · EARTH–MOON SYSTEM`：NASA LROC 月球、压缩距离和地月轨道过渡。
4. `04 · SOLAR SYSTEM`：八大行星、五颗矮行星、主要卫星、精细行星环、小行星带、柯伊伯带、黄道光与日球层。
5. `05 · STELLAR NEIGHBORHOOD`：太阳系退场、Spitzer GLIMPSE 360 红外银河平面与恒星近邻过渡。
6. `06 · MILKY WAY`：中央棒、四条独立 phase / pitch 的非对称碎裂旋臂、尘埃衰减、外盘 flare / warp、恒星形成区、薄盘 / 厚盘、恒星晕、球状星团和太阳位置。
7. `07 · LOCAL GROUP`：银河系、仙女座、三角座、大小麦哲伦云、18 个形态不同的矮伴星系及深空星系场。

## scale-cosmic6 本轮新增

### 电影级连续转场与输入

- `main.js` 使用统一视觉尺度临界阻尼弹簧，让镜头、场景显隐、银河天幕和文案共享同一连续时间轴。
- 五次连续 easing 取代边界跳变；快速缩放加入克制的 FOV 呼吸、相机位置 / 观察点分层惯性和停止后的快速收敛。
- 文案在阶段边界先淡出、位移和轻微失焦，再换字淡入；真实连续滚轮抽样中，旧 / 新阶段在约 `150–260 ms` 内完成换场，页面始终 `scrollY === 0`。
- `src/controls.js` 增加滚轮死区、微输入残量聚合、反向制动和目标超前限制，同时保留键盘、拖拽、单指和双指控制。

### 近实时高清地球

- 新增 `assets/nasa/earth-blue-marble-5400.jpg`；桌面优先使用 5400×2700，compact 使用 2048×1024，并在近地阶段降低云层与低分辨率实时图层权重，优先显示地貌。
- 新增 `src/live-earth.js`：当前 UTC 太阳星历和 subsolar point 实时更新；NASA GIBS 提供最新可用的每日真彩卫星观测。
- 桌面按设备能力自适应 2048×1024 / 4096×2048，compact 为 1024×512；支持 Suomi NPP、NOAA-20 和高档位 MODIS Terra 回退。
- GIBS 黑色无数据区域由 Shader 亮度遮罩露出 Blue Marble；超时、CORS、无效图或断网均保持静态地球和实时晨昏线。
- 地球近景重新选择真实 subsolar 半球附近的初始观察方向；经项目实际 `SphereGeometry` 验证，四个代表日期的太阳方向与声明的经纬 UV 法线点积均为 `1.000000000000`。

### 行星、银河与星系群

- `src/planet-textures.js` 把桌面 / compact 行星纹理提升至 2048 / 1024 级，加入多尺度地貌、陨石坑喷射纹、地形脉络、气态风暴和涡旋；太阳纹理提升至 1536 / 768。
- `src/sky-band.js` 降低程序化霓虹感，以桌面 `0.085` 的低权重灰度化混入 GLIMPSE 360 真实结构；compact 不下载第二纹理。
- `src/galaxy.js` 增加每臂独立 phase / pitch、碎裂包络、羽毛状支脉、CPU + Shader 双层尘埃衰减、外盘 flare / warp、低饱和暖核冷盘及多形态远景星系。
- 粒子总预算保持不增加；新增尘埃 pass 仅增加桌面 3、compact 1 个 draw call，并保留 reduced-motion、fallback 和 dispose。

## scale-cosmic5 既有基线

### 银河天幕

- `src/sky-band.js` 保持原 API，银河视觉倾角由约 `-7.5°` 调整为约 `-24°`。
- Shader 增加弯曲重采样、不规则宽度、中央尘埃裂隙、断续尘埃丝、暖色银心和冷蓝星云层次。
- 由纯 Additive 改为 Normal blending，保留暗部和尘埃，不再发白成一条直线。
- 桌面和 compact 模式分别控制细星密度，并保留 reduced-motion、resize 和 dispose。

### 银河系与本星系群

- `src/galaxy.js` 重构银河、M31、M33、LMC、SMC，使棒旋、平滑双臂、絮状旋臂和不规则形态明确区分。
- 银河加入非等权旋臂、分叉、局部断续、尘埃暗带、蓝/粉恒星形成区、厚盘、恒星晕和 103 个程序化球状星团。
- 桌面加入 18 个伴星系；覆盖致密椭圆、矮球状、不规则和超低表面亮度形态。
- 远景采用单 draw-call shader 星系场：桌面 3,200 个、compact 720 个；带倾角、扁率、色温和椭圆/盘状亮度剖面。
- 桌面点顶点预算约 148,826，compact 约 34,587；移动端点数降低约 77%。

### 地球、太阳系与深空

- 太阳加入颗粒对流、日斑、双层旋转日冕、日珥与 Fresnel 日面辉光。
- 岩质行星增加分形地貌、陨石坑和地形纹理；气态行星增加细流带、湍流、风暴和大红斑层次。
- 土星环增加卡西尼缝、恩克缝、细环带、颗粒噪声和视角透光变化。
- 地球 Shader 重调昼夜线、城市灯光、海洋镜面、大气 Rayleigh / Mie 近似和暖色晨昏带。
- 恒星场改为光谱色温、可变星等、柔和衍射和克制闪烁；增加低成本深空反射星云薄雾。
- 小行星带和柯伊伯带使用可变粒径 Shader；compact 模式降低点数和像素比。
- 手机近地镜头单独调远，避免窄屏只看到放大的地表纹理。

### 输入控制

- 新增 `src/controls.js`，把输入从 `main.js` 中独立出来。
- 滚轮支持 pixel / line / page 三种 `deltaMode`，使用有界对数曲线、尺度分段灵敏度、缩放速度和时间制阻尼。
- 拖拽改为纯轨道 yaw / pitch；观察中心不再同时平移。
- “抓住宇宙”方向已调整：右拖时画面跟手向右；带俯仰限制、速度上限和时间制惯性。
- 保留单指旋转、双指 pinch、Home / End、Page Up / Page Down、上下缩放、左右旋转及 Shift + 上下俯仰。
- reduced-motion 会立即收敛缩放并清除缩放/旋转速度。

## 最新浏览器验收

- 本地地址：`http://localhost:4173/`
- 桌面：`1440 × 900`
- 手机：`390 × 844`
- 两端均为单 canvas、`scrollY === 0`、无横向溢出。
- 桌面连续滚轮和手机连续滚轮均按 `01 → 02 → 03 → 04 → 05 → 06 → 07` 完整到达，没有跳失阶段；正向缩放全过程页面不滚动。
- 桌面近地、完整地球、太阳系、银河系和本星系群已完成截图级检查；手机近地与本星系群完成截图级检查，文案和实时状态无越界。
- NASA GIBS 实际返回 `ready`，最新可用影像日期为 `2026-07-22 UTC`；本地核心资源状态为 `NASA DATA · ORIGINAL VISIBLE-SKY ART`。
- 桌面 / 手机控制台均无 warning、无 error；银河代理的 desktop / compact WebGL Shader 实机编译均为 0 error。
- 浏览器只读环境不提供 `requestAnimationFrame` 性能采样接口，因此没有伪造 FPS 数字；通过连续滚轮、停靠收敛、截图和控制台实际检查判断转场稳定性。

## 发布状态

- 当前稳定线上版本：`scale-cosmic6`
- 功能提交：`a3bd66d`（`Upgrade cinematic Earth and galaxy journey`）
- GitHub Pages workflow `29981307439` 已完成，结论为 `success`，部署 HEAD 与 `a3bd66d516bc277aa7daa7df9b8d277f131407d7` 一致。
- Pages 首页已确认返回 `scale-cosmic6`；`main.js`、`src/live-earth.js`、`src/galaxy.js` 和 `assets/nasa/earth-blue-marble-5400.jpg` 均在线返回 HTTP 200，5400 资产大小为 `1,005,484` bytes。
- 旗舰升级提交：`f7dfbbf`（`Overhaul Scale Beyond cosmic visuals and controls`）
- 上一稳定版：`scale-cosmic5`（记录提交 `ab06519`）。
- `main.js`、控制器、银河/行星/天幕模块、Three.js，以及关键 NASA 与原创银河资源均在线返回 HTTP 200。
- 线上首屏已在真实浏览器打开并截图确认；本地完整桌面/手机旅程仍保持无 warning、无 error、无 WebGL Shader 编译错误。
- 仓库中存在与本项目无关的未跟踪脚本、安装包、文档和备份；提交时只能精确暂存 Scale Beyond 文件，禁止 `git add -A`。

## 下一步

1. 后续可加入实际帧率采样和动态粒子质量降级，让低端设备在保留构图的同时主动调整粒子与纹理预算。
2. 如继续扩展尺度，可新增本超星系团 / 拉尼亚凯亚 / 宇宙网，但保持现有七段旅程的节奏与控制逻辑。

## 主要历史检查点

- 2026-06-29：完成 Three.js MVP、Git 初始化、GitHub Pages 与 NASA 纹理 fallback 结构。
- 2026-07-21：完成七段旅程、地球昼夜、太阳系、银河系、本星系群与首次桌面/手机验收。
- 2026-07-21：完成原创可见光银河天幕、Spitzer GLIMPSE 360、黄道光、日球层、柯伊伯带和纪录片式文案排版，发布 `scale-cosmic4`。
- 2026-07-21：完成全场景真实感、星系多样性、深空星系场和控制系统重构，以 `f7dfbbf` 发布 `scale-cosmic5` 并通过线上资源验证。
- 2026-07-23：完成 `scale-cosmic6`：电影级连续转场、实时太阳 / NASA GIBS 近实时地球、5400 地貌底图、高清行星纹理和银河真实性升级；以 `a3bd66d` 发布，桌面 / 手机七段本地验收及 Pages 回源验证通过。
