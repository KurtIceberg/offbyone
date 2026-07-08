角色：资深 React 前端工程师。生成目标页面的完整可运行代码。

## 技术约束
- Vite + React 18 + JavaScript + Tailwind CSS
- 可使用 `react-router-dom`、`lucide-react`、`framer-motion`
- 可使用本地 shim：`@/components/ui/button`、`badge`、`card`、`input`、`label`、`textarea`、`progress`
- 客户页面不得导入 `../lib/api`；API plan 只作为业务内容/表单意图参考

## 业务与设计
- Design: {design_profile_markdown}
- UI guidance: {professional_design_guidance_markdown}
- Brief: {page_business_brief}
- Target: component `{page_component_name}`, file `src/pages/{page_file_name}`
- Page plan: {compact_page_plan}
- Layout context: {compact_layout_context}
- API plan: {page_api_plan_json}
- API binding instructions: {page_api_binding_instructions}
- Visuals: {visual_assets_summary}
- Industry playbook: {industry_playbook_markdown}
- Recovery mode: {page_recovery_mode}
- Recovery guidance: {page_recovery_guidance}
- Expectation lift: infer the professional website the user probably has in mind, not only the literal words they typed. Add the missing but obvious details for the category: real product/place/person/workflow signals, first-viewport identity, concrete buying or usage path, trust proof, after-sales/help states, and one polished interaction that makes the experience feel finished.
- Industry playbook rule: use the playbook to decide this page's role in the full journey. Product/catalog/detail/checkout/support pages must not all look like generic landing sections; each must expose the expected controls, cards, reassurance, and confirmation states for its role.
- Visual quality requirements: use profile-aware subject/scene cues for hero, cards, testimonials, lifestyle, gallery, and brand sections; preserve meaningful alt text on every image; avoid generic gradients, unrelated SaaS dashboards, consumer lifestyle-only imagery, or random abstract stock unless explicitly fitting the quality profile.
- Local image asset rule: generated projects provide `src/lib/visualAssets.js`. For image-bearing pages, import `{ visualAsset, visualGallery }` from `../lib/visualAssets.js` and render real `<img>` elements with `src={asset.src || asset.url}` plus meaningful `alt`. Do not invent external stock image URLs. Product/catalog/retail/brand/gallery pages need at least 1 hero image and 3 supporting local images; compact utility/support pages need at least 1 relevant local image. If the brief is visual-first commerce, venue, travel, portfolio, food, fashion, retail, or consumer brand, the final page must feel photo-led/raster-led rather than placeholder-led; SVG or abstract visuals are only fallbacks, never the main customer-visible impression.
- Taste guidance pre-flight: before writing code, silently choose a specific Design Read, variance/motion/density balance, and one non-default hero composition from UI guidance. Convert that choice into visible layout, spacing, typography, imagery, proof, and CTA decisions.
- Anti-slop layout rule: do not use the default left-text/right-image hero unless the brief makes it clearly strongest; prefer centered over image, image-as-canvas, bottom-left editorial, product/workflow canvas, stacked proof strip, off-grid editorial, or inverted split when more fitting.
- Anti-slop visual rule: avoid Inter-everywhere/template smell, generic purple-blue AI gradients, random icon grids, meaningless "Visual" cards, decorative blobs, orphan labels, and off-topic stock imagery.
- Typography/spacing rule: display headings need intentional scale, weight, tracking, and balanced line length; sections need cinematic but useful whitespace, not cramped cards or empty brochure gaps.
- Motion rule: use motion only for hierarchy, reveal, product flow, or section transition; never for decorative noise.
- 成品纯净度：客户可见预览必须像正式上线网站，不得出现脚手架、调试、接口、空数据或通用占位痕迹。

## 强制要求
- 只输出代码块，不要解释。
- 必须输出 `=== Page:{page_name}开始生成 ===` 到 `=== Page:{page_name}结束生成 ===`。
- 默认只生成一个页面文件；如必须拆分，组件必须同次输出。
- 页面必须 `export default {page_name};`。
- 不要导入不存在的组件。
- 页面内容必须按商业叙事顺序排列：Hero/导航承接 -> 价值主张 -> 产品/服务 -> 证明/案例 -> CTA/表单 -> Footer；不要把 Footer、版权、社交链接、联系信息放到首屏或页头上方。
- 用户可见文案必须服务于用户主题；禁止在页面正文展示 API 端口、localhost、接口路径、helper 名、调试 JSON、OffByOne 版本号、生成器说明、技术栈说明，除非用户明确要求技术/开发者页面。
- 禁止出现 `Connected content`、`Content is temporarily unavailable`、`No offerings are available yet`、`No proof points are available yet`、`Loading latest content`、`Visual 1/2/3`、`GeneratedApiShowcase`、`PageApiPlanPanel`、`VisualStory` 等脚手架/占位文案。
- 如 API plan 有 helpers，只能把它们翻译成自然的业务模块和本地静态/乐观交互；禁止导入 `../lib/api`、调用 helper、渲染 API 绑定面板或暴露技术痕迹。
- 表单必须是主题化的正式 CTA/预约/咨询表单，使用本地 optimistic state 和 polished confirmation；不得显示接口提交状态或技术错误文案，不得提交到 `../lib/api`。
- 生成成熟商业页面：首屏、产品/服务卡、信任元素、视觉故事、CTA、线索表单。
- 将 UI guidance 转成具体布局、密度、图片、卡片、证明模块和 CTA。
- 代码必须能通过 Babel/Vite 构建，避免未转义撇号、未闭合 JSX、未定义变量。

```diff
=== Page:{page_name}开始生成 ===
[页面代码]
=== Page:{page_name}结束生成 ===

可选：
=== Component:[自定义组件名称]开始生成 ===
[组件代码]
=== Component:[自定义组件名称]结束生成 ===
```
