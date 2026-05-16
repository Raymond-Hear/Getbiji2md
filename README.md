# Get 笔记 Markdown 下载工具

一个面向 **Get 笔记** 的网页工具，用来把你账号里的笔记批量整理并下载为 Markdown 文件。

支持这些常用场景：

- 按关键词搜索笔记
- 按知识库筛选笔记
- 按标签筛选笔记
- 预览笔记内容
- 单篇下载 Markdown
- 多选后批量打包下载 `.zip`
- 分别下载原文或 AI 总结

## 使用前提

使用这个工具前，你需要先准备好：

- 一个 **Get 笔记会员账号**
- 一个可用的 `API Key`
- 一个可用的 `Client ID`

根据 Get 笔记官方文档，**API 功能需要 Get 笔记会员账号才能使用**。如果你还不是会员，相关接口能力可能无法正常使用。

官方参考：

- [Get 笔记 AI 技能和开放平台](https://doc.biji.com/docs/AGhfwzioqiHbv4kbObjcuStnnBg)
- [Skill 使用指南](https://doc.biji.com/docs/HHuAwoyLpiboVHk75SfcdKc7n4d)
- [CLI 使用指南](https://doc.biji.com/docs/RotowC78viiHOdkQrJtcha5Fnvh/)

## 如何获取 API Key 和 Client ID

1. 打开 [Get 笔记开放平台](https://www.biji.com/openapi)
2. 创建应用
3. 创建完成后，获取：
   - `API Key`
   - `Client ID`
4. 妥善保存你的 `API Key`

官方文档说明：

- [API 文档](https://doc.biji.com/docs/WOxgwObNNiyMHWk1dl0cJqSxnEd/)
- [Get 笔记知识库 OpenAPI 快速上手](https://doc.biji.com/docs/WLUjwn3noiPMBWkFOPkcTqcnn6e)

注意：

- `API Key` 通常只会在生成时显示一次，请及时保存
- 不要把 `API Key`、`Client ID`、Token 等敏感信息提交到 GitHub 或公开仓库

## 怎么使用

1. 打开这个网页
2. 点击右上角的 `设置`
3. 填入你的 `API Key` 和 `Client ID`
4. 保存设置
5. 页面会自动加载你的笔记数据
6. 你可以通过关键词、知识库、标签来筛选内容
7. 选中想要导出的笔记
8. 选择下载原文或下载 AI 总结
9. 批量下载时会自动打包为一个 `.zip`

## 下载结果说明

- 单篇下载：会直接下载一个 `.md` 文件
- 批量下载：会下载一个 `.zip` 压缩包
- 压缩包内：每一条笔记对应一个独立的 `.md` 文件

## 隐私说明

这个网页不会把你的 `API Key` 和 `Client ID` 写进仓库文件。

当前版本会把你填写的配置保存在**当前浏览器本地**，方便下次继续使用。请只在你信任的设备和浏览器环境中使用。
