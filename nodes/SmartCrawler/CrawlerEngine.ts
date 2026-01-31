/**
 * CrawlerEngine - 独立的爬虫引擎，可用于外部测试
 * 支持模拟点击跳转功能
 */
import axios from 'axios';
import * as cheerio from 'cheerio';

export interface FieldConfig {
	name: string;
	selector: string;
	type: 'text' | 'html' | 'attribute';
	attribute?: string;
	isJump?: boolean;
	jumpConfig?: JumpConfig;
}

export interface JumpConfig {
	clickSelector: string;  // 点击元素选择器
	targetSelector?: string; // 目标页面数据选择器
	urlTemplate?: string;   // URL模板，用于data-id场景，如 "/model/{id}"
	fields?: FieldConfig[];
}

export interface CrawlerOptions {
	url: string;
	listSelector: string;
	fields: FieldConfig[];
	cookie?: string;
	userAgent?: string;
	maxItems?: number;
}

export interface CrawlerResult {
	success: boolean;
	data: Record<string, unknown>[];
	errors: string[];
}

const DEFAULT_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

export class CrawlerEngine {
	/**
	 * 从元素提取 URL（支持多种方式）
	 */
	private static extractUrlFromElement(el: cheerio.Cheerio<any>): string | null {
		// 1. 标准 href
		const href = el.attr('href');
		if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
			return href;
		}

		// 2. 常见的数据属性
		const dataAttrs = ['data-href', 'data-url', 'data-link', 'data-src', 'data-target-url'];
		for (const attr of dataAttrs) {
			const val = el.attr(attr);
			if (val && val.startsWith('/') || val?.startsWith('http')) {
				return val;
			}
		}

		// 3. 解析 onclick 中的 URL
		const onclick = el.attr('onclick') || '';
		const onclickMatch = onclick.match(/(?:location\.href|window\.location|location)\s*=\s*['"]([^'"]+)['"]/);
		if (onclickMatch) {
			return onclickMatch[1];
		}
		// window.open('url')
		const openMatch = onclick.match(/window\.open\s*\(\s*['"]([^'"]+)['"]/);
		if (openMatch) {
			return openMatch[1];
		}

		// 4. 通过 data-id 构造 URL（常见模式）
		const dataId = el.attr('data-id') || el.attr('data-item-id') || el.attr('data-model-id');
		if (dataId) {
			// 返回一个标记，让上层处理
			return `__data_id__:${dataId}`;
		}

		return null;
	}

	/**
	 * 模拟点击 - 从指定元素出发，查找可跳转的链接
	 * 支持：href、data-*属性、onclick内联事件
	 */
	private static findClickableLink(element: cheerio.Cheerio<any>, clickSelector: string): string | null {
		// 1. 在元素内查找 clickSelector
		if (clickSelector) {
			const inner = element.find(clickSelector).first();
			if (inner.length) {
				const url = CrawlerEngine.extractUrlFromElement(inner);
				if (url) return url;
			}
		}

		// 2. 直接从当前元素提取
		const directUrl = CrawlerEngine.extractUrlFromElement(element);
		if (directUrl) return directUrl;

		// 3. 元素内部的 a 标签
		const innerA = element.find('a').first();
		if (innerA.length) {
			const url = CrawlerEngine.extractUrlFromElement(innerA);
			if (url) return url;
		}

		// 4. 父元素链接
		const parentA = element.closest('a');
		if (parentA.length) {
			const url = CrawlerEngine.extractUrlFromElement(parentA);
			if (url) return url;
		}

		// 5. 在容器内查找（向上3层）
		let container = element.parent();
		for (let i = 0; i < 3 && container.length; i++) {
			// 先找 a 标签
			const link = container.find('a').first();
			if (link.length) {
				const url = CrawlerEngine.extractUrlFromElement(link);
				if (url) return url;
			}
			// 再找带 onclick 或 data-href 的元素
			const clickable = container.find('[onclick], [data-href], [data-url]').first();
			if (clickable.length) {
				const url = CrawlerEngine.extractUrlFromElement(clickable);
				if (url) return url;
			}
			container = container.parent();
		}

		return null;
	}

	private static resolveUrl(base: string, rel: string): string {
		try { return new URL(rel, base).href; } catch { return rel; }
	}

	private static extractValue(
		element: cheerio.Cheerio<any>,
		type: 'text' | 'html' | 'attribute',
		attribute?: string,
	): string | null {
		switch (type) {
			case 'text': return element.text().trim() || null;
			case 'html': return element.html() || null;
			case 'attribute': return attribute ? element.attr(attribute) || null : null;
			default: return null;
		}
	}

	/**
	 * 提取字段值（支持跳转）
	 */
	private static async extractField(
		element: cheerio.Cheerio<any>,
		field: FieldConfig,
		baseUrl: string,
		cookie: string,
		userAgent: string,
		jumpLevel: number,
	): Promise<unknown> {
		if (jumpLevel > 3) {
			throw new Error('最多支持3跳');
		}

		const el = element.find(field.selector).first();
		if (el.length === 0) return null;

		// 非跳转字段
		if (!field.isJump || !field.jumpConfig) {
			return CrawlerEngine.extractValue(el, field.type, field.attribute);
		}

		// 跳转字段 - 模拟点击
		let href = CrawlerEngine.findClickableLink(el, field.jumpConfig.clickSelector);
		if (!href) return null;

		// 处理 data-id 模式
		if (href.startsWith('__data_id__:') && field.jumpConfig.urlTemplate) {
			const dataId = href.replace('__data_id__:', '');
			href = field.jumpConfig.urlTemplate.replace('{id}', dataId);
		} else if (href.startsWith('__data_id__:')) {
			// 没有模板，无法构造 URL
			return null;
		}

		const jumpUrl = CrawlerEngine.resolveUrl(baseUrl, href);

		const jumpRes = await axios.get(jumpUrl, {
			headers: { ...(cookie && { Cookie: cookie }), 'User-Agent': userAgent }
		});

		const $j = cheerio.load(jumpRes.data);
		const target = field.jumpConfig.targetSelector
			? $j(field.jumpConfig.targetSelector).first()
			: $j('body');

		if (target.length === 0) return null;

		// 有子字段配置
		if (field.jumpConfig.fields?.length) {
			const subData: Record<string, unknown> = {};
			for (const sf of field.jumpConfig.fields) {
				subData[sf.name] = await CrawlerEngine.extractField(
					target, sf, jumpUrl, cookie, userAgent, jumpLevel + 1
				);
			}
			return subData;
		}

		return target.text().trim();
	}

	/**
	 * 执行爬虫
	 */
	static async crawl(options: CrawlerOptions): Promise<CrawlerResult> {
		const {
			url,
			listSelector,
			fields,
			cookie = '',
			userAgent = DEFAULT_UA,
			maxItems,
		} = options;

		const result: CrawlerResult = { success: true, data: [], errors: [] };

		try {
			const res = await axios.get(url, {
				headers: { ...(cookie && { Cookie: cookie }), 'User-Agent': userAgent }
			});

			const $ = cheerio.load(res.data);
			const items = $(listSelector);

			if (items.length === 0) {
				result.success = false;
				result.errors.push(`未找到列表: "${listSelector}"`);
				return result;
			}

			const count = maxItems ? Math.min(items.length, maxItems) : items.length;

			for (let i = 0; i < count; i++) {
				const item = items.eq(i);
				const data: Record<string, unknown> = {};

				for (const field of fields) {
					try {
						data[field.name] = await CrawlerEngine.extractField(
							item, field, url, cookie, userAgent, 1
						);
					} catch (e) {
						data[field.name] = null;
						result.errors.push(`${field.name}: ${e instanceof Error ? e.message : String(e)}`);
					}
				}

				result.data.push(data);
			}
		} catch (e) {
			result.success = false;
			result.errors.push(e instanceof Error ? e.message : String(e));
		}

		return result;
	}
}
