# Get 笔记 Markdown 下载工具

一个本地优先的 Get 笔记导出工具。它可以作为公开网页访问，也可以下载到本地或自行部署使用。

这个项目当前不做登录、不做数据库、不做云端同步。你填写的 `API Key` 和 `Client ID` 只保存在当前浏览器本地，笔记内容也在你的浏览器里完成读取、整理和下载。

如果你在 **Get 笔记** 里已经记了很多内容，迟早会碰到一个很现实的问题：

这些笔记我想下载下来，尤其是我自己写的原文。

但在很多时候，你更容易拿到的是 AI 处理后的内容，而不是那份真正想保存、想整理、想继续使用的原文。

这个工具就是专门为这件事做的。

它的重点不是泛泛地“导出笔记”，而是把 **Get 笔记里的原文内容真正下载下来**，并保存成 Markdown 文件。你也可以按知识库、标签、关键词去找，再批量勾选、批量打包下载。

## 它能帮你做什么

- 下载笔记原文为 Markdown
- 下载 AI 总结为 Markdown
- 批量打包下载
- 按知识库筛选
- 按标签筛选
- 按关键词搜索
- 筛选后选择当前结果
- 点击笔记里的知识库或标签快速筛选
- 预览内容
- 查看单篇笔记
- 下载单篇笔记

## 当前产品形态

这是一个轻量 MVP，不是 SaaS 平台。

- 无需注册账号
- 无需登录本工具
- 无需数据库
- 可作为公开网页托管
- 也可下载后本地打开
- 凭证保存在用户自己的浏览器里
- 项目方不保存你的 API Key、Client ID 或笔记内容

更完整的产品规划见 [PRD](docs/PRD.md)，开发进度见 [项目进度](docs/PROGRESS.md)。

如果你平时会把内容放进 Obsidian、Notion、本地文件夹，或者只是想把自己在 Get 笔记里真正写下来的内容留一份在手里，这个工具会很顺手。

## 开始之前先确认

你需要准备这三样东西：

- 一个 **Get 笔记会员账号**
- 你的 `API Key`
- 你的 `Client ID`

这里有个前提要先说清楚：

根据 Get 笔记官方开放平台文档，**开放 API 能力面向 Get 笔记会员提供**。如果你不是会员，相关接口通常没法正常使用，这个工具也就无法正常工作。

官方入口和文档：

- [Get 笔记开放平台](https://www.biji.com/openapi)
- [Get 笔记 API 文档](https://doc.biji.com/docs/WOxgwObNNiyMHWk1dl0cJqSxnEd/)
- [Get 笔记知识库 OpenAPI 快速上手](https://doc.biji.com/docs/WLUjwn3noiPMBWkFOPkcTqcnn6e)
- [Get 笔记 AI 技能和开放平台](https://doc.biji.com/docs/AGhfwzioqiHbv4kbObjcuStnnBg)

如果你现在还不是会员，也可以先试用一下：

- [通过这个邀请链接领取 Get 笔记新人会员 3 天体验](https://www.biji.com/i/0D8SZ0N4E3?os=ANDROID&referral=0D8SZ0N4E3&trace=eyJzX3VzZXJfaWQiOjEyMDIwOCwic19lbnRpdHlfdHlwZSI6Imludml0ZV9yZWZlcnJhbCIsInNfZW50aXR5X2lkIjoiNjhlMDA0OWY4ZTM0ZmNiNGQ2NGQ1MWM1In0%3D&uid=XyZzEwqy)

如果你只是想先体验一下这个工具，或者先看看自己的账号能不能正常走通开放平台流程，这会是一个更轻的开始方式。

## Client ID 和 API Key 怎么拿

如果你之前没接触过开放平台，按下面这个顺序来就够了：

1. 打开 [Get 笔记开放平台](https://www.biji.com/openapi?tab=clients)
2. 登录你的 Get 账号
3. 找到「Get 笔记 Skill & Cli」官方默认授权应用
4. 点击「生成 Key」，保存：
   - `API Key`
   - `Client ID`
5. 回到这个工具里填写并保存

如果你想先看官方说明，再回来操作，也可以先看：

- [API 文档总览](https://doc.biji.com/docs/WOxgwObNNiyMHWk1dl0cJqSxnEd/)
- [Skill 使用指南](https://doc.biji.com/docs/HHuAwoyLpiboVHk75SfcdKc7n4d)
- [CLI 使用指南](https://doc.biji.com/docs/RotowC78viiHOdkQrJtcha5Fnvh/)

有一句一定要提醒：

`API Key` 是敏感信息。不要发给别人，也不要写进公开仓库、截图、教程或者聊天记录里。

## 怎么使用

整个流程很简单：

1. 打开这个网页
2. 点击 `接口设置`
3. 填入你的 `API Key` 和 `Client ID`
4. 保存设置
5. 等页面自动加载你的笔记
6. 用关键词、知识库、标签筛出你想要的内容
7. 勾选要导出的笔记
8. 选择下载原文，或者下载 AI 总结

如果你只下载一篇，它会直接给你一个 `.md` 文件。  
如果你一次选了多篇，它会自动打成一个 `.zip` 压缩包，里面每条笔记都会对应一个独立的 Markdown 文件。

## 它最适合这些场景

- 你想把 Get 笔记里的原文长期留在自己手里
- 你想把某个知识库里的笔记批量整理出来
- 你想按标签或关键词找出一批内容，再统一下载
- 你想把笔记继续放进自己的写作流、知识管理流或备份系统里

## 隐私说明

网站里也提供了面向普通用户的独立隐私说明页：[privacy.html](privacy.html)。

这个工具不会把你的 `API Key` 和 `Client ID` 写进仓库文件。

当前版本会把你填写的配置保存在**当前浏览器本地**，这样你下次打开时不用重新填写。你可以在设置里一键清除本地保存的配置。

所以也建议你只在自己信任的设备上使用它。

如果你准备把这个项目部署到自己的环境里，也记得不要把这些内容传到公开位置：

- 真实的 `API Key`
- `Client ID`
- Token
- 本地配置文件

## License

本项目采用 [MIT License](LICENSE) 开源。
