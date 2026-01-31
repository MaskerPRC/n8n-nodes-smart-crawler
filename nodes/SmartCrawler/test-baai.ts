/**
 * 测试脚本 - 测试 hub.baai.ac.cn (SPA 页面，需要 puppeteer 渲染)
 *
 * 运行方式: npx ts-node nodes/SmartCrawler/test-baai.ts
 */

const { CrawlerEngine } = require('./CrawlerEngine');

async function main() {
	console.log('='.repeat(50));
	console.log('测试: hub.baai.ac.cn (puppeteer 浏览器模式)');
	console.log('='.repeat(50));
	console.log('列表: div.story-list > div');
	console.log('字段: h6.story-item-title -> title');
	console.log('模式: useBrowser = true');
	console.log('='.repeat(50) + '\n');

	const result = await CrawlerEngine.crawl({
		url: 'https://hub.baai.ac.cn/',
		listSelector: 'div.story-list > div',
		useBrowser: true,
		maxItems: 3,
		fields: [
			{
				name: 'title',
				selector: 'h6.story-item-title',
				type: 'text',
			}
		]
	});

	console.log('\n' + '='.repeat(50));
	console.log('结果');
	console.log('='.repeat(50));
	console.log(`成功: ${result.success}`);
	console.log(`数据条数: ${result.data.length}`);

	if (result.errors.length > 0) {
		console.log('\n错误:');
		result.errors.forEach((e: string, i: number) => console.log(`  ${i + 1}. ${e}`));
	}

	console.log('\n数据:');
	console.log(JSON.stringify(result.data, null, 2));
}

main().catch(console.error);
