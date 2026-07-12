角色：你是一个资深前端工程师，需要你帮我生成根布局 Layout.jsx 的完整代码。

## 技术栈约束
- Vite 4.4.5
- React 18
- JavaScript
- Shadcn/UI
- Tailwind CSS 3.3
- lucide
- framer-motion（仅在需要时使用）

## 页面模板
```javascript
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { motion } from "framer-motion";
import { Button } from '@/components/ui/button';
import Header from './components/Header';
// ... 其他需要的依赖

const Layout = () => {
    // 使用 useState/useEffect 模拟数据（如导航菜单、语言选项）
    
    return (
        <div className="min-h-screen flex flex-col bg-background text-foreground">
            {/* 页面功能模块 */}
            <Header />
            <main className="flex-grow pt-16">
                <Outlet />
            </main>
            <Footer />
        </div>
    )
}

export default Layout;
```


## Design System Profile (OffByOne v4.7.2)
{design_profile_markdown}

Follow this profile before making layout decisions. The reference family ({design_reference_family}) is professional design vocabulary only: use its rhythm, hierarchy, spacing, density, and component conventions as inspiration, but do not clone brand identity, logos, copy, assets, or exact pages. Avoid every listed anti-pattern.

## Professional UI Guidance
{professional_design_guidance_markdown}

Apply this guidance directly to the app shell: navigation density, spacing rhythm, component style, CTA treatment, visual hierarchy, and interaction motion quality must match the routed artifact type. If motion is used, keep it purposeful, transform/opacity-based, sub-300ms for routine UI, and reduced-motion-aware.

## Compact business brief
{layout_brief}

## Profile-aware visual requirements
{visual_assets_summary}

Apply these visual requirements to navigation language, shell framing, section rhythm, and global image expectations. Do not steer non-SaaS sites toward dashboard imagery; do not steer B2B SaaS sites toward consumer lifestyle-only imagery. Avoid generic gradients/random abstract images as the primary visual story.

## Industry Expectation Playbook
{industry_playbook_markdown}

Use this to name navigation, primary CTA, support links, and shell-level reassurance. Keep the shell generic enough for every page, but the language should clearly fit the detected industry.

## Compact layout/page plan
{layout_page_plan}

## 输出约束
- 仅输出代码块（不要解释、不要文档说明）
- 页面名称与组件名称必须为英文大驼峰命名
- 严格保持页面顺序：Header/导航必须在最上方，主内容 `{children}`/`<Outlet />` 在中间，Footer 只能在页面末尾；禁止把 Footer、版权、联系信息、社交链接放到 Header 或主内容之前。
- Layout 只承载全局壳层，不要展示 API 端口、localhost、调试面板、接口清单、技术栈说明或与用户主题无关的系统信息。
- 必须包含 Layout.jsx 页面
- Layout.jsx 必须支持 `children`，并在主内容区渲染 `{children}`；可以同时兼容 `<Outlet />`
- Layout.jsx中导入自定义组件的路径格式为“./components/组件名称”
- 可选拆分其他模块（例如 Header、Footer）
- 组件文件必须以 export default ComponentName; 结尾
- 禁止出现 export { ComponentName } 语法
- 每个自定义组件只能输出一次，禁止重复
- 输出代码必须直接通过 ESLint 和 Babel Parser 检查
- 严格使用以下格式：
```diff
=== Layout:[Layout.jsx]开始生成 ===
[页面代码]
=== Layout:[Layout.jsx]结束生成 ===

=== Component:[自定义组件名称]开始生成 ===
[组件代码]
=== Component:[自定义组件名称]结束生成 ===

```
