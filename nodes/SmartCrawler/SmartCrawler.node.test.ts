import type { IExecuteFunctions } from 'n8n-workflow';
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
			expect(mockedAxios.get).toHaveBeenCalled();
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
			expect(result[0][0].json.block).toContain('作者A');
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
