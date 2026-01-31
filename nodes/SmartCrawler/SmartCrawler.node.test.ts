import type { IExecuteFunctions } from 'n8n-workflow';
// eslint-disable-next-line @n8n/community-nodes/no-restricted-imports
import axios from 'axios';
import { SmartCrawler } from './SmartCrawler.node';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

/** 模拟的列表页 HTML */
const MOCK_LIST_HTML = `
<!DOCTYPE html>
<html>
<head><title>测试页</title></head>
<body>
  <ul class="item-list">
    <li class="item">
      <span class="title">文章一</span>
      <a class="link" href="/detail/1">查看详情</a>
      <span class="author">作者A</span>
    </li>
    <li class="item">
      <span class="title">文章二</span>
      <a class="link" href="/detail/2">查看详情</a>
      <span class="author">作者B</span>
    </li>
    <li class="item">
      <span class="title">文章三</span>
      <a class="link" href="/detail/3">查看详情</a>
      <span class="author">作者C</span>
    </li>
  </ul>
</body>
</html>
`;

/**
 * 模拟 fal.ai/explore 页面结构，对应 RSSHub HTML 转换格式：
 * rsshub://rsshub/transform/html/https%3A%2F%2Ffal.ai%2Fexplore/
 *   item=.mb-8:nth-child(1) .group%5C%2Fcarousel > .group > .relative > .flex > div
 *   &itemTitle=span.font-medium
 *   &itemDesc=p.my-2
 */
const MOCK_FAL_EXPLORE_HTML = `
<!DOCTYPE html>
<html>
<head><title>fal.ai - Explore</title></head>
<body>
  <div class="mb-8">
    <div class="group/carousel">
      <div class="group">
        <div class="relative">
          <div class="flex">
            <div>
              <span class="font-medium">FLUX Pro</span>
              <p class="my-2">High quality image generation model.</p>
            </div>
            <div>
              <span class="font-medium">Llama 3.3</span>
              <p class="my-2">Latest open source LLM from Meta.</p>
            </div>
            <div>
              <span class="font-medium">Stable Audio</span>
              <p class="my-2">Create music and sound effects.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

function createMockExecuteFunctions(params: {
	url: string;
	cookie?: string;
	listSelector: string;
	fields: Array<{
		name: string;
		selector: string;
		type: 'text' | 'html' | 'attribute';
		attribute?: string;
		isJump?: boolean;
		jumpConfig?: unknown;
	}>;
	continueOnFail?: boolean;
	inputItemCount?: number;
}): IExecuteFunctions {
	const { url, cookie = '', listSelector, fields, continueOnFail = false, inputItemCount = 1 } = params;
	const mockNode = { name: 'Smart Crawler', type: 'n8n-nodes-base.smartCrawler' };

	return {
		getNodeParameter: jest.fn((param: string, _itemIndex: number, fallback?: unknown) => {
			if (param === 'url') return url;
			if (param === 'cookie') return cookie;
			if (param === 'listSelector') return listSelector;
			if (param === 'fields') return { field: fields };
			return fallback;
		}),
		getInputData: jest.fn(() => {
			return Array.from({ length: inputItemCount }, (_, i) => ({ json: { index: i }, pairedItem: { item: i } }));
		}),
		continueOnFail: jest.fn(() => continueOnFail),
		getNode: jest.fn(() => mockNode),
	} as unknown as IExecuteFunctions;
}

describe('SmartCrawler', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockedAxios.get.mockResolvedValue({ data: MOCK_LIST_HTML, status: 200 });
	});

	describe('execute', () => {
		it('应能根据列表选择器和字段配置提取多条数据', async () => {
			const crawler = new SmartCrawler();
			const mockContext = createMockExecuteFunctions({
				url: 'https://example.com/list',
				listSelector: '.item-list .item',
				fields: [
					{ name: 'title', selector: '.title', type: 'text' },
					{ name: 'author', selector: '.author', type: 'text' },
					{ name: 'link', selector: '.link', type: 'attribute', attribute: 'href' },
				],
			});

			const result = await crawler.execute.call(mockContext);

			expect(mockedAxios.get).toHaveBeenCalledTimes(1);
			expect(mockedAxios.get).toHaveBeenCalledWith(
				'https://example.com/list',
				expect.objectContaining({
					headers: expect.objectContaining({
						'User-Agent': expect.any(String),
					}),
				}),
			);

			expect(result).toHaveLength(1);
			expect(result[0]).toHaveLength(3);

			expect(result[0][0].json).toEqual({
				title: '文章一',
				author: '作者A',
				link: '/detail/1',
			});
			expect(result[0][1].json).toEqual({
				title: '文章二',
				author: '作者B',
				link: '/detail/2',
			});
			expect(result[0][2].json).toEqual({
				title: '文章三',
				author: '作者C',
				link: '/detail/3',
			});
		});

		it('应在请求头中携带 Cookie（当传入 cookie 时）', async () => {
			const crawler = new SmartCrawler();
			const mockContext = createMockExecuteFunctions({
				url: 'https://example.com/list',
				listSelector: '.item-list .item',
				cookie: 'session_id=abc123',
				fields: [{ name: 'title', selector: '.title', type: 'text' }],
			});

			await crawler.execute.call(mockContext);

			expect(mockedAxios.get).toHaveBeenCalledWith(
				'https://example.com/list',
				expect.objectContaining({
					headers: expect.objectContaining({
						Cookie: 'session_id=abc123',
					}),
				}),
			);
		});

		it('当 url 为空时应抛出错误', async () => {
			const crawler = new SmartCrawler();
			const mockContext = createMockExecuteFunctions({
				url: '',
				listSelector: '.item',
				fields: [{ name: 'title', selector: '.title', type: 'text' }],
			});

			await expect(crawler.execute.call(mockContext)).rejects.toThrow('页面链接不能为空');
			expect(mockedAxios.get).not.toHaveBeenCalled();
		});

		it('当 listSelector 为空时应抛出错误', async () => {
			const crawler = new SmartCrawler();
			const mockContext = createMockExecuteFunctions({
				url: 'https://example.com/list',
				listSelector: '',
				fields: [{ name: 'title', selector: '.title', type: 'text' }],
			});

			await expect(crawler.execute.call(mockContext)).rejects.toThrow('列表选择器不能为空');
			expect(mockedAxios.get).not.toHaveBeenCalled();
		});

		it('当列表选择器匹配不到元素时应抛出错误', async () => {
			const crawler = new SmartCrawler();
			const mockContext = createMockExecuteFunctions({
				url: 'https://example.com/list',
				listSelector: '.not-exist',
				fields: [{ name: 'title', selector: '.title', type: 'text' }],
			});

			await expect(crawler.execute.call(mockContext)).rejects.toThrow(
				'未找到匹配列表选择器 ".not-exist" 的元素',
			);
		});

		it('应支持提取 html 类型字段', async () => {
			const crawler = new SmartCrawler();
			const mockContext = createMockExecuteFunctions({
				url: 'https://example.com/list',
				listSelector: '.item-list .item',
				fields: [
					{ name: 'title', selector: '.title', type: 'text' },
					{ name: 'block', selector: 'span', type: 'html' },
				],
			});

			const result = await crawler.execute.call(mockContext);

			expect(result[0][0].json.title).toBe('文章一');
			expect(result[0][0].json.block).toContain('文章一');
		});
	});

	/**
	 * RSSHub transform/html 风格测试
	 * 参考：rsshub://rsshub/transform/html/https%3A%2F%2Ffal.ai%2Fexplore/item%3D...%26itemTitle%3Dspan.font-medium%26itemDesc%3Dp.my-2
	 * 解码后：url=https://fal.ai/explore, item=.mb-8:nth-child(1) .group/carousel > .group > .relative > .flex > div, itemTitle=span.font-medium, itemDesc=p.my-2
	 */
	describe('RSSHub 风格（fal.ai/explore）', () => {
		beforeEach(() => {
			mockedAxios.get.mockResolvedValue({ data: MOCK_FAL_EXPLORE_HTML, status: 200 });
		});

		it('应按 RSSHub item/itemTitle/itemDesc 选择器提取 fal.ai explore 列表', async () => {
			const crawler = new SmartCrawler();
			const mockContext = createMockExecuteFunctions({
				url: 'https://fal.ai/explore',
				listSelector: '.mb-8 .group\\/carousel > .group > .relative > .flex > div',
				fields: [
					{ name: 'itemTitle', selector: 'span.font-medium', type: 'text' },
					{ name: 'itemDesc', selector: 'p.my-2', type: 'text' },
				],
			});

			const result = await crawler.execute.call(mockContext);

			expect(mockedAxios.get).toHaveBeenCalledWith(
				'https://fal.ai/explore',
				expect.objectContaining({
					headers: expect.objectContaining({ 'User-Agent': expect.any(String) }),
				}),
			);

			expect(result[0]).toHaveLength(3);

			expect(result[0][0].json).toEqual({
				itemTitle: 'FLUX Pro',
				itemDesc: 'High quality image generation model.',
			});
			expect(result[0][1].json).toEqual({
				itemTitle: 'Llama 3.3',
				itemDesc: 'Latest open source LLM from Meta.',
			});
			expect(result[0][2].json).toEqual({
				itemTitle: 'Stable Audio',
				itemDesc: 'Create music and sound effects.',
			});
		});

		it('使用简化列表选择器 .mb-8 .flex > div 时仍能正确提取 itemTitle/itemDesc', async () => {
			const crawler = new SmartCrawler();
			const mockContext = createMockExecuteFunctions({
				url: 'https://fal.ai/explore',
				listSelector: '.mb-8 .flex > div',
				fields: [
					{ name: 'itemTitle', selector: 'span.font-medium', type: 'text' },
					{ name: 'itemDesc', selector: 'p.my-2', type: 'text' },
				],
			});

			const result = await crawler.execute.call(mockContext);

			expect(result[0]).toHaveLength(3);
			expect(result[0][0].json.itemTitle).toBe('FLUX Pro');
			expect(result[0][0].json.itemDesc).toBe('High quality image generation model.');
		});
	});

	describe('description', () => {
		it('节点应包含正确的 displayName 和 name', () => {
			const crawler = new SmartCrawler();
			expect(crawler.description.displayName).toBe('Smart Crawler');
			expect(crawler.description.name).toBe('smartCrawler');
		});
	});
});
