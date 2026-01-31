import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import axios from 'axios';

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';

interface FieldData {
	name: string;
	selector: string;
	fieldType: 'normal' | 'jump';
	type?: 'text' | 'html' | 'attribute';
	attribute?: string;
	clickSelector?: string;
	targetSelector?: string;
	jumpFields?: { field?: JumpSubField[] };
}

interface JumpSubField {
	name: string;
	selector: string;
	type: 'text' | 'html' | 'attribute';
	attribute?: string;
}

interface FieldsData {
	field?: FieldData[];
}

export class SmartCrawler implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Smart Crawler',
		name: 'smartCrawler',
		icon: 'file:../../icons/smart-crawler.svg',
		group: ['input'],
		version: 1,
		description: '通用智能爬虫节点，支持多跳数据提取',
		defaults: {
			name: 'Smart Crawler',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		properties: [
			{
				displayName: '页面链接',
				name: 'url',
				type: 'string',
				required: true,
				default: '',
				placeholder: 'https://example.com',
				description: '要爬取的页面URL',
			},
			{
				displayName: 'Cookie',
				name: 'cookie',
				type: 'string',
				default: '',
				placeholder: 'session_id=xxx; user_id=yyy',
				description: '请求时使用的Cookie（可选）',
			},
			{
				displayName: '列表选择器',
				name: 'listSelector',
				type: 'string',
				required: true,
				default: '',
				placeholder: '.item, .product-item',
				description: '用于选择数据列表的CSS选择器',
			},
			{
				displayName: '启用浏览器渲染',
				name: 'useBrowser',
				type: 'boolean',
				default: false,
				description: '使用 Puppeteer 渲染页面，适用于 JS 动态渲染的 SPA 页面（如 Vue/React 应用）',
			},
			{
				displayName: '字段配置',
				name: 'fields',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				default: {},
				options: [
					{
						displayName: '字段',
						name: 'field',
						values: [
							{
								displayName: '字段名称',
								name: 'name',
								type: 'string',
								required: true,
								default: '',
								description: '字段的输出名称',
							},
							{
								displayName: '选择器',
								name: 'selector',
								type: 'string',
								required: true,
								default: '',
								placeholder: '.title, #name',
								description: 'CSS选择器，用于定位元素',
							},
							{
								displayName: '提取类型',
								name: 'type',
								type: 'options',
								options: [
									{ name: '文本内容', value: 'text' },
									{ name: 'HTML内容', value: 'html' },
									{ name: '属性值', value: 'attribute' },
								],
								default: 'text',
								description: '如何提取字段值',
								displayOptions: {
									show: { fieldType: ['normal'] },
								},
							},
							{
								displayName: '属性名',
								name: 'attribute',
								type: 'string',
								default: '',
								placeholder: 'href, src, data-id',
								description: '当提取类型为属性值时，指定要提取的属性名',
								displayOptions: {
									show: { fieldType: ['normal'], type: ['attribute'] },
								},
							},
							{
								displayName: '字段类型',
								name: 'fieldType',
								type: 'options',
								options: [
									{
										name: '普通字段',
										value: 'normal',
									},
									{
										name: '跳转字段',
										value: 'jump',
									},
								],
								default: 'normal',
								description: '普通字段直接提取值，跳转字段会跳转到新页面提取数据',
							},
							// ---- 跳转字段配置 ----
							{
								displayName: '点击元素选择器',
								name: 'clickSelector',
								type: 'string',
								default: '',
								placeholder: 'a.detail-link',
								description: '用于查找跳转链接的选择器（在字段选择器元素内查找）',
								displayOptions: {
									show: { fieldType: ['jump'] },
								},
							},
							{
								displayName: '目标页面数据选择器',
								name: 'targetSelector',
								type: 'string',
								default: '',
								placeholder: '.content, #main',
								description: '跳转后页面中要提取数据的区域选择器（为空则使用整个页面）',
								displayOptions: {
									show: { fieldType: ['jump'] },
								},
							},
							{
								displayName: '跳转页面字段',
								name: 'jumpFields',
								type: 'fixedCollection',
								typeOptions: { multipleValues: true },
								default: {},
								displayOptions: {
									show: { fieldType: ['jump'] },
								},
								options: [
									{
										displayName: '字段',
										name: 'field',
										values: [
											{
												displayName: '字段名称',
												name: 'name',
												type: 'string',
												required: true,
												default: '',
											},
											{
												displayName: '选择器',
												name: 'selector',
												type: 'string',
												required: true,
												default: '',
											},
											{
												displayName: '提取类型',
												name: 'type',
												type: 'options',
												options: [
													{ name: '文本内容', value: 'text' },
													{ name: 'HTML内容', value: 'html' },
													{ name: '属性值', value: 'attribute' },
												],
												default: 'text',
											},
											{
												displayName: '属性名',
												name: 'attribute',
												type: 'string',
												default: '',
												displayOptions: {
													show: { type: ['attribute'] },
												},
											},
										],
									},
								],
							},
						],
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const url = this.getNodeParameter('url', itemIndex, '') as string;
				const cookie = this.getNodeParameter('cookie', itemIndex, '') as string;
				const listSelector = this.getNodeParameter('listSelector', itemIndex, '') as string;
				const useBrowser = this.getNodeParameter('useBrowser', itemIndex, false) as boolean;
				const fieldsData = this.getNodeParameter('fields', itemIndex, {}) as FieldsData;

				if (!url) {
					throw new NodeOperationError(this.getNode(), '页面链接不能为空', { itemIndex });
				}
				if (!listSelector) {
					throw new NodeOperationError(this.getNode(), '列表选择器不能为空', { itemIndex });
				}

				// 解析字段配置
				let fields: FieldData[] = [];
				if (fieldsData && typeof fieldsData === 'object') {
					if ('field' in fieldsData) {
						const fv = fieldsData.field;
						if (Array.isArray(fv)) {
							fields = fv;
						} else if (fv && typeof fv === 'object') {
							fields = [fv as FieldData];
						}
					} else if (Array.isArray(fieldsData)) {
						fields = fieldsData as FieldData[];
					}
				}

				// 获取页面 HTML
				let pageHtml: string;

				if (useBrowser) {
					const puppeteer = await import('puppeteer');
					const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
					try {
						const page = await browser.newPage();
						if (cookie) {
							const cookies = cookie.split(';').map(c => {
								const [name, ...rest] = c.trim().split('=');
								return { name: name.trim(), value: rest.join('=').trim(), domain: new URL(url).hostname };
							}).filter(c => c.name && c.value);
							if (cookies.length) await page.setCookie(...cookies);
						}
						await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
						await page.waitForSelector(listSelector, { timeout: 15000 });
						pageHtml = await page.content();
					} finally {
						await browser.close();
					}
				} else {
					const response = await axios.get(url, {
						headers: {
							...(cookie && { Cookie: cookie }),
							'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
						},
					});
					pageHtml = response.data;
				}

				const $ = cheerio.load(pageHtml);
				const listItems = $(listSelector);

				if (listItems.length === 0) {
					throw new NodeOperationError(
						this.getNode(),
						`未找到匹配列表选择器 "${listSelector}" 的元素`,
						{ itemIndex },
					);
				}

				// 处理每个列表项
				for (let i = 0; i < listItems.length; i++) {
					const listItem = listItems.eq(i);
					const itemData: Record<string, unknown> = {};

					for (const field of fields) {
						try {
							if (field.fieldType === 'jump') {
								itemData[field.name] = await SmartCrawler.extractJumpField(
									listItem, field, url, cookie, useBrowser,
								);
							} else {
								itemData[field.name] = SmartCrawler.extractNormalField(
									listItem, field,
								);
							}
						} catch (error) {
							if (this.continueOnFail()) {
								itemData[field.name] = null;
							} else {
								throw error;
							}
						}
					}

					returnData.push({
						json: itemData as IDataObject,
						pairedItem: { item: itemIndex },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: (error as Error).message },
						pairedItem: { item: itemIndex },
					});
				} else {
					throw new NodeOperationError(this.getNode(), error as Error, { itemIndex });
				}
			}
		}

		return [returnData];
	}

	/**
	 * 提取普通字段
	 */
	private static extractNormalField(
		listItem: cheerio.Cheerio<AnyNode>,
		field: FieldData,
	): string | null {
		const el = listItem.find(field.selector).first();
		if (el.length === 0) return null;

		const type = field.type || 'text';
		switch (type) {
			case 'text': return el.text().trim() || null;
			case 'html': return el.html() || null;
			case 'attribute': return field.attribute ? el.attr(field.attribute) || null : null;
			default: return null;
		}
	}

	/**
	 * 提取跳转字段 - 跳转到新页面并提取子字段
	 */
	private static async extractJumpField(
		listItem: cheerio.Cheerio<AnyNode>,
		field: FieldData,
		baseUrl: string,
		cookie: string,
		useBrowser: boolean,
	): Promise<Record<string, unknown> | string | null> {
		const el = listItem.find(field.selector).first();
		if (el.length === 0) return null;

		// 查找跳转链接
		const jumpUrl = SmartCrawler.findJumpUrl(el, field.clickSelector || '', baseUrl);
		if (!jumpUrl) return null;

		// 获取跳转页面
		let jumpHtml: string;

		if (useBrowser) {
			const puppeteer = await import('puppeteer');
			const browser = await puppeteer.default.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
			try {
				const page = await browser.newPage();
				if (cookie) {
					const cookies = cookie.split(';').map(c => {
						const [name, ...rest] = c.trim().split('=');
						return { name: name.trim(), value: rest.join('=').trim(), domain: new URL(jumpUrl).hostname };
					}).filter(c => c.name && c.value);
					if (cookies.length) await page.setCookie(...cookies);
				}
				await page.goto(jumpUrl, { waitUntil: 'networkidle2', timeout: 30000 });
				if (field.targetSelector) {
					await page.waitForSelector(field.targetSelector, { timeout: 15000 }).catch(() => {});
				}
				jumpHtml = await page.content();
			} finally {
				await browser.close();
			}
		} else {
			const res = await axios.get(jumpUrl, {
				headers: {
					...(cookie && { Cookie: cookie }),
					'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
				},
			});
			jumpHtml = res.data;
		}

		const $j = cheerio.load(jumpHtml);
		const target = field.targetSelector
			? $j(field.targetSelector).first()
			: $j('body');

		if (target.length === 0) return null;

		// 提取子字段
		const subFields = SmartCrawler.parseJumpSubFields(field.jumpFields);

		if (subFields.length > 0) {
			const result: Record<string, unknown> = {};
			for (const sf of subFields) {
				const subEl = target.find(sf.selector).first();
				if (subEl.length === 0) {
					result[sf.name] = null;
					continue;
				}
				switch (sf.type || 'text') {
					case 'text': result[sf.name] = subEl.text().trim() || null; break;
					case 'html': result[sf.name] = subEl.html() || null; break;
					case 'attribute': result[sf.name] = sf.attribute ? subEl.attr(sf.attribute) || null : null; break;
					default: result[sf.name] = null;
				}
			}
			return result;
		}

		// 没有子字段配置时返回目标区域文本
		return target.text().trim() || null;
	}

	/**
	 * 查找跳转 URL
	 */
	private static findJumpUrl(
		el: cheerio.Cheerio<AnyNode>,
		clickSelector: string,
		baseUrl: string,
	): string | null {
		const extractHref = (target: cheerio.Cheerio<AnyNode>): string | null => {
			const href = target.attr('href')
				|| target.attr('data-href')
				|| target.attr('data-url');
			if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
				return href;
			}
			// 检查 onclick
			const onclick = target.attr('onclick') || '';
			const m = onclick.match(/(?:location\.href|window\.location)\s*=\s*['"]([^'"]+)['"]/);
			if (m) return m[1];
			const m2 = onclick.match(/window\.open\s*\(\s*['"]([^'"]+)['"]/);
			if (m2) return m2[1];
			return null;
		};

		// 1. clickSelector 指定的元素
		if (clickSelector) {
			const click = el.find(clickSelector).first();
			if (click.length) {
				const href = extractHref(click);
				if (href) return SmartCrawler.resolveUrl(baseUrl, href);
			}
		}

		// 2. 元素内部的 a 标签
		const innerA = el.find('a[href]').first();
		if (innerA.length) {
			const href = extractHref(innerA);
			if (href) return SmartCrawler.resolveUrl(baseUrl, href);
		}

		// 3. 元素本身
		const selfHref = extractHref(el);
		if (selfHref) return SmartCrawler.resolveUrl(baseUrl, selfHref);

		// 4. 父元素 a 标签
		const parentA = el.closest('a');
		if (parentA.length) {
			const href = extractHref(parentA);
			if (href) return SmartCrawler.resolveUrl(baseUrl, href);
		}

		// 5. 向上查找容器内链接
		let container = el.parent();
		for (let i = 0; i < 3 && container.length; i++) {
			const link = container.find('a[href]').first();
			if (link.length) {
				const href = extractHref(link);
				if (href) return SmartCrawler.resolveUrl(baseUrl, href);
			}
			container = container.parent();
		}

		return null;
	}

	/**
	 * 解析跳转子字段配置
	 */
	private static parseJumpSubFields(jumpFields?: { field?: JumpSubField[] }): JumpSubField[] {
		if (!jumpFields || typeof jumpFields !== 'object') return [];
		if ('field' in jumpFields) {
			const fv = jumpFields.field;
			if (Array.isArray(fv)) return fv;
			if (fv && typeof fv === 'object') return [fv as JumpSubField];
		}
		if (Array.isArray(jumpFields)) return jumpFields as JumpSubField[];
		return [];
	}

	private static resolveUrl(base: string, rel: string): string {
		try { return new URL(rel, base).href; } catch { return rel; }
	}
}
