/**
 * 测试脚本 - 测试 HuggingFace deepseek-ai 组织页面爬取
 *
 * 运行方式: npx ts-node nodes/SmartCrawler/test-huggingface.ts
 */

const axios = require('axios');
const cheerio = require('cheerio');

interface FieldConfig {
	name: string;
	selector: string;
	type: 'text' | 'html' | 'attribute';
	attribute?: string;
	isJump?: boolean;
	jumpConfig?: JumpConfig;
}

interface JumpConfig {
	clickSelector: string;  // 点击元素选择器（在 field.selector 元素内或附近查找）
	targetSelector?: string; // 目标页面数据选择器
	fields?: FieldConfig[];
}

interface CrawlerOptions {
	url: string;
	listSelector: string;
	fields: FieldConfig[];
	cookie?: string;
	maxItems?: number;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';

function resolveUrl(base: string, rel: string): string {
	try { return new URL(rel, base).href; } catch { return rel; }
}

/**
 * 模拟点击 - 从指定元素出发，查找可跳转的链接
 * 查找顺序：元素内部 -> 元素本身 -> 父元素链接 -> 同级容器内链接
 */
function findClickableLink($: any, element: any, clickSelector: string): string | null {
	// 1. 在元素内查找 clickSelector
	if (clickSelector) {
		const inner = element.find(clickSelector).first();
		if (inner.length && inner.attr('href')) {
			return inner.attr('href');
		}
	}

	// 2. 元素内部的 a 标签
	const innerA = element.find('a[href]').first();
	if (innerA.length) {
		return innerA.attr('href');
	}

	// 3. 元素本身是 a 标签
	if (element.is('a') && element.attr('href')) {
		return element.attr('href');
	}

	// 4. 父元素是 a 标签
	const parentA = element.closest('a');
	if (parentA.length && parentA.attr('href')) {
		return parentA.attr('href');
	}

	// 5. 在同一列表项容器内查找（向上3层）
	let container = element.parent();
	for (let i = 0; i < 3 && container.length; i++) {
		const link = container.find('a[href]').first();
		if (link.length) {
			const href = link.attr('href');
			if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
				return href;
			}
		}
		container = container.parent();
	}

	return null;
}

async function crawl(options: CrawlerOptions) {
	const { url, listSelector, fields, cookie = '', maxItems } = options;
	const results: any[] = [];

	console.log('正在获取页面...');
	const res = await axios.default.get(url, {
		headers: { ...(cookie && { Cookie: cookie }), 'User-Agent': UA }
	});

	const $ = cheerio.load(res.data);
	const items = $(listSelector);
	const count = maxItems ? Math.min(items.length, maxItems) : items.length;
	console.log(`找到 ${items.length} 个列表项，处理 ${count} 个\n`);

	for (let i = 0; i < count; i++) {
		const item = items.eq(i);
		const data: any = {};
		console.log(`--- 第 ${i + 1} 项 ---`);

		for (const field of fields) {
			const el = item.find(field.selector).first();
			if (el.length === 0) {
				data[field.name] = null;
				continue;
			}

			if (!field.isJump || !field.jumpConfig) {
				// 普通字段
				data[field.name] = field.type === 'attribute'
					? el.attr(field.attribute)
					: el.text().trim();
				console.log(`  ${field.name}: ${data[field.name]}`);
				continue;
			}

			// 跳转字段 - 模拟点击
			const href = findClickableLink($, el, field.jumpConfig.clickSelector);
			if (!href) {
				console.log(`  ${field.name}: 未找到跳转链接`);
				data[field.name] = null;
				continue;
			}

			const jumpUrl = resolveUrl(url, href);
			console.log(`  ${field.name}: 跳转到 ${jumpUrl}`);

			try {
				const jumpRes = await axios.default.get(jumpUrl, {
					headers: { ...(cookie && { Cookie: cookie }), 'User-Agent': UA }
				});
				const $j = cheerio.load(jumpRes.data);
				const target = field.jumpConfig.targetSelector
					? $j(field.jumpConfig.targetSelector).first()
					: $j('body');

				if (target.length === 0) {
					console.log(`    目标选择器未匹配: ${field.jumpConfig.targetSelector}`);
					data[field.name] = null;
				} else if (field.jumpConfig.fields?.length) {
					// 提取子字段
					const subData: any = {};
					for (const sf of field.jumpConfig.fields) {
						const subEl = target.find(sf.selector).first();
						subData[sf.name] = subEl.length
							? (sf.type === 'attribute' ? subEl.attr(sf.attribute) : subEl.text().trim())
							: null;
					}
					data[field.name] = subData;
					console.log(`    提取数据:`, JSON.stringify(subData).substring(0, 100) + '...');
				} else {
					data[field.name] = target.text().trim().substring(0, 200);
					console.log(`    内容: ${data[field.name].substring(0, 80)}...`);
				}
			} catch (e: any) {
				console.log(`    跳转失败: ${e.message}`);
				data[field.name] = null;
			}
		}
		results.push(data);
	}
	return results;
}

// 测试配置 - 按用户要求
async function main() {
	console.log('='.repeat(50));
	console.log('测试: HuggingFace deepseek-ai 页面');
	console.log('='.repeat(50));
	console.log('列表: div.org-profile-content > div');
	console.log('跳转字段: header.mb-1');
	console.log('目标页面: div.model-card-content');
	console.log('='.repeat(50) + '\n');

	const results = await crawl({
		url: 'https://huggingface.co/organizations/deepseek-ai/activity/all',
		listSelector: 'div.org-profile-content > div',
		maxItems: 2,
		fields: [
			{
				name: 'title',
				selector: 'header.mb-1',
				type: 'text',
			},
			{
				name: 'detail',
				selector: 'header.mb-1',
				type: 'text',
				isJump: true,
				jumpConfig: {
					clickSelector: 'a',
					targetSelector: 'div.model-card-content',
				}
			}
		]
	});

	console.log('\n' + '='.repeat(50));
	console.log('结果汇总');
	console.log('='.repeat(50));
	console.log(JSON.stringify(results, null, 2));
}

main().catch(console.error);
