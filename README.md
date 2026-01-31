# @loopsaaage/n8n-nodes-smart-crawler

[![npm version](https://badge.fury.io/js/%40loopsaaage%2Fn8n-nodes-smart-crawler.svg)](https://www.npmjs.com/package/@loopsaaage/n8n-nodes-smart-crawler)

通用智能爬虫 n8n 节点，使用 Axios + Cheerio 实现，支持灵活的页面数据提取和多跳数据采集。

## 功能特性

- **🎯 灵活的选择器配置**：使用 CSS 选择器精确定位页面元素
- **📦 多字段提取**：支持同时提取多个字段，包括文本、HTML、属性值
- **🔗 多跳支持**：最多支持 3 跳跳转，深度提取嵌套页面数据
- **🍪 Cookie 支持**：支持配置 Cookie 访问需要登录的页面
- **⚙️ 预设字段**：提供常用的字段提取配置选项
- **🔄 自动 URL 解析**：自动处理相对路径和绝对路径 URL

## 快速开始

### 安装

在 n8n 中安装此节点：

```bash
npm install @loopsaaage/n8n-nodes-smart-crawler
```

然后在 n8n 设置中刷新节点，即可在节点面板中使用。

### 基础使用

1. 添加 **Smart Crawler** 节点到工作流
2. 配置以下参数：
   - **页面链接**：要爬取的页面 URL
   - **Cookie**：（可选）访问需要登录的页面时设置
   - **列表选择器**：选择数据列表的 CSS 选择器
3. 添加字段配置：
   - **字段名称**：输出数据的字段名
   - **选择器**：CSS 选择器定位元素
   - **提取类型**：文本内容 / HTML 内容 / 属性值
   - **属性名**：（当类型为属性值时）指定属性名
4. 执行工作流，提取数据

## 配置说明

### 列表选择器

指定包含多个数据项的容器选择器。例如：
- `.product-item` - 选择所有 class 为 product-item 的元素
- `.news-list > li` - 选择列表中的所有列表项
- `div[data-type="item"]` - 选择具有特定属性的元素

### 字段配置

每个字段配置项可以提取列表项中的特定数据。

#### 提取类型

- **文本内容**：提取元素的文本内容（去除空白）
- **HTML 内容**：提取元素的 HTML 代码
- **属性值**：提取元素的指定属性值

### 多跳配置

对于需要跳转到其他页面提取的字段，可以启用跳转配置。

#### 跳转配置结构

每跳包含以下配置：

- **点击元素选择器**：用于获取跳转链接的元素
- **目标页面数据选择器**：（可选）跳转后页面的数据容器选择器
- **字段**：在跳转页面要提取的字段列表

#### 跳转层级

- **第一跳**：从列表项跳转到详情页
- **第二跳**：从详情页跳转到相关页面
- **第三跳**：继续深入跳转

## 使用示例

### 示例 1：提取新闻列表

```
页面链接：https://news.example.com
列表选择器：.news-item
字段：
  - 字段名称：title
    选择器：.title
    提取类型：文本内容
  - 字段名称：link
    选择器：a.read-more
    提取类型：属性值
    属性名：href
```

### 示例 2：多跳提取商品详情

```
页面链接：https://shop.example.com/products
列表选择器：.product-card
字段：
  - 字段名称：productName
    选择器：h3.name
    提取类型：文本内容
  - 字段名称：details
    选择器：a.detail-link
    是否为跳转字段：是
    跳转配置（第一跳）：
      点击元素选择器：a
      字段：
        - 字段名称：price
          选择器：.price
          提取类型：文本内容
        - 字段名称：description
          选择器：.description
          提取类型：HTML 内容
```

## 开发

### 本地开发

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建
npm run build

# 代码检查
npm run lint
npm run lint:fix
```

### 发布

```bash
# 构建项目
npm run build

# 发布到 npm
npm publish
```

## 技术栈

- **[Axios](https://github.com/axios/axios)** - HTTP 请求库
- **[Cheerio](https://github.com/cheeriojs/cheerio)** - 快速的 HTML/XML 解析器

## 许可证

[MIT](LICENSE.md)

## 贡献

欢迎提交 Issue 和 Pull Request！

## 链接

- [n8n](https://n8n.io) - 工作流自动化工具
- [n8n 文档](https://docs.n8n.io) - 官方文档
- [n8n 社区](https://community.n8n.io) - 社区论坛
